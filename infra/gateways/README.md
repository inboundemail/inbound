# Gateway host

One EC2 instance runs both protocol gateways: `packages/smtp-gateway` (465, 587) and
`packages/imap-gateway` (993). This CDK app (`InboundGatewayHost`, us-east-2,
account 375612485665) replaced the two hand-built boxes on 2026-10-21. `smtp` and `imap`
point at its Elastic IP, the old boxes are terminated, and `deploy-gateway-host.yml` is the
only deploy path.

## Architecture

```
GitHub Actions (deploy-gateway-host.yml on main, production env, OIDC)
  └─ role github-gateway-host-deploy: s3:PutObject releases/*, ssm:SendCommand (this instance + InboundGatewayDeploy only)
       ├─ upload releases/<gateway>-<sha>.tar.gz  ──►  S3 artifact bucket (private, versioned, 90-day expiry)
       └─ ssm send-command InboundGatewayDeploy(gateway, s3Key, sha256)
                                  │
EC2 t4g.small, Ubuntu 24.04 arm64, Elastic IP, IMDSv2, sshd masked (Session Manager only, logged)
  inbound-host-sync    verifies the host bundle (infra/gateways/host, a CDK asset) against its SHA-256 manifest, then re-applies it
  inbound-firewall     nftables: per-source connection and new-connection limits on 465/587/993
  inbound-alert        SNS inbound-gateway-alerts when a gateway or certificate run fails, or the disk fills
  inbound-health       journal counts every 10 minutes → SNS when a HEALTH_* threshold is crossed; daily report at 13:00 UTC
  inbound-deploy       download → verify sha256 → bun install → switch symlink → restart → health check → roll back on failure
  inbound-render-env   SSM /inbound/gateways/{shared,<gateway>}/* (allowlisted names) → /etc/inbound/<gateway>-gateway.env
  inbound-certs        lego DNS-01 via Route 53, daily timer, installs certs into /etc/inbound/tls/<gateway>/versions/, switches the live symlink
  smtp-gateway.service (user smtpgw, MemoryMax 384M)   imap-gateway.service (user imapgw, MemoryMax 1200M)
```

- **Runtime:** Node 24 runs the gateways, as on the old boxes (`node src/index.ts`).
  Bun 1.4.2 installs dependencies only (`--frozen-lockfile --production --ignore-scripts`,
  as the unprivileged `inboundbuild` user, in a transient `systemd-run` service capped at
  512 MB so an install can't push the running gateways out of memory). That service can't reach
  the metadata service, sees the filesystem read-only except the package and its own cache, and
  systemd kills anything it leaves running before the release is handed to root. Bun, Node and lego are pinned in
  `host/host.env` and installed only after their SHA-256 checksums match. A 2 GB swapfile
  (`vm.swappiness=10`) absorbs spikes; the gateway units themselves never swap
  (`MemorySwapMax=0`).
- **Isolation:** the gateway units run with `IPAddressDeny=169.254.169.254/32 fd00:ec2::254/128`,
  so the gateway processes can't reach the instance metadata service or the instance role's
  credentials. The gateways make no AWS calls.
- **SMTP parsing:** the SMTP gateway parses each message in its own `worker_threads` worker
  with a heap limit (`SMTP_PARSE_HEAP_MB`, default 64), terminated at `SMTP_PARSE_TIMEOUT_MS`.
  At most `SMTP_MAX_CONCURRENT_PARSES` (default 2) run at once, so their worst case (about
  100 MB each) plus the buffered bodies stays under `MemoryMax=384M`. Raising either knob
  needs a higher `MemoryMax`.
- **IMAP FETCH memory:** message content in flight is bounded by
  `IMAP_FETCH_MEMORY_BUDGET_BYTES`, and one credential may hold at most half of it. A client
  whose FETCH response makes no progress for 60 seconds is disconnected and its share freed.
- **Core dumps:** both units set `LimitCORE=0`, so a crash never writes message content or secrets
  to a core file.
- **Code:** `/opt/inbound/releases/<gateway>-<sha>` (owned by root, read-only to the
  services). `/opt/inbound/current-<gateway>` is switched atomically. The last 3 releases
  are kept. Artifacts unpack in `/opt/inbound/staging` (root, 0755); only the unpacked
  source is handed to `inboundbuild` for the install.
- **Certificates:** one per hostname, issued by Let's Encrypt with lego. Vercel DNS keeps
  `inboundemail.com`. `_acme-challenge.smtp` and `_acme-challenge.imap` are CNAMEs into
  the Route 53 zone `acme.inboundemail.com`, so the instance role can only write those two
  TXT records. Issuance doesn't depend on where the A records point, so it works before
  cutover. Certs renew when fewer than 30 days remain. Each cert and key pair is written to
  its own `versions/<timestamp>-<serial>/` directory, checked to match, and published by
  atomically switching the `live` symlink (`fullchain.pem` and `privkey.pem` point into
  `live/`). A renewed SMTP cert restarts `smtp-gateway`. The IMAP gateway hot-reloads its
  cert within 12 hours, so it isn't restarted. `inbound-certs` and `inbound-deploy` share
  `/run/inbound-certs.lock`, so a renewal never restarts a gateway during a deploy's
  switch and health check.
- **Secrets:** SecureString parameters under `/inbound/gateways/`, encrypted with the
  stack's customer-managed KMS key `alias/inbound-gateways` (rotation on, kept if the stack
  is deleted). An explicit deny on `ssm:GetParameter*` for every parameter outside
  `/inbound/gateways/` overrides the `GetParameter` grant in `AmazonSSMManagedInstanceCore`,
  so the instance can't read SecureStrings elsewhere in the account (including ones under
  the `aws/ssm` key, which any principal in the account can decrypt through SSM). The
  instance can decrypt only with `alias/inbound-gateways`, only through SSM, and only when
  the encryption context `PARAMETER_ARN` is under `/inbound/gateways/`.
  `inbound-render-env` writes only the variables each gateway reads in its `src/config.ts`.
  Hostnames, ports, TLS paths and plaintext switches are host-managed, and any other name
  (`NODE_OPTIONS`, `LD_PRELOAD`, …) is skipped with a warning that names it. Env files are
  rendered `0640 root:<service>`. Values are never logged.
- **Port 143:** closed, matching the old imap box (only 993 with implicit TLS). To enable STARTTLS on 143, set `IMAP_STARTTLS_PORT_ENABLED=true` in `host/host.env`, add 143 to `ingressPorts` in `lib/config.ts`, and run `verify.sh` with `VERIFY_IMAP_143=1`.
- **OS updates:** unattended-upgrades installs security updates only. When an update
  needs a reboot, the host reboots at 08:00 UTC (`AUTO_REBOOT` and `AUTO_REBOOT_TIME` in
  `host/host.env`). Both gateways are down for about a minute during that reboot.
  needrestart never restarts `smtp-gateway` or `imap-gateway` after a library update (they
  pick it up at the next deploy or reboot). Snaps (`amazon-ssm-agent`, `aws-cli`) refresh
  only between 08:00 and 08:30 UTC (`SNAP_REFRESH_TIMER`), and `inbound-deploy` holds their
  refreshes while it runs. The first bootstrap reboots once if the base upgrade needs it.
- **Host bundle integrity:** at synth time the stack computes a `sha256sum` manifest of every
  file in `host/` and stores it in the SSM parameter `/inbound/gateways/host/bundle-sha256`,
  next to `bundle-url`. Before anything from a bundle runs, `inbound-host-sync` checks that the
  URL matches `^s3://cdk-hnb659fds-assets-375612485665-us-east-2/[0-9a-f]{64}\.zip$`, that the
  zip holds exactly the files in the manifest (no extra, missing, duplicate or unsafe names),
  and that `sha256sum -c` passes. A zip with directory entries (for example an empty
  directory) is refused too; cdk-assets zips files only. Otherwise it logs `REFUSING host bundle …` (journal tag
  `inbound-host-sync`, and the deploy's output) and exits non-zero, so the deploy stops before
  `inbound-deploy`. `sudo inbound-host-sync --check` verifies the published bundle without
  applying it. User data (first boot only) doesn't verify yet, because changing it stops and
  starts the instance: set `verifyHostBundleInUserData: true` in `lib/config.ts` with the next
  AMI change, which replaces the instance anyway.
- **Firewall:** `inbound-firewall.service` loads `/etc/inbound/firewall.nft` (rendered by
  `bootstrap.sh` from `host/host.env`) early at boot, before the network. Per source IPv4 and
  gateway port it allows at most 30 concurrent connections and 30 new connections a minute
  (burst 60), and drops the rest. The limits sit above the gateways' own per-IP limits (SMTP 10,
  IMAP 20), so a normal client gets the gateway's error first. Only connections to the gateway
  ports are tracked by conntrack; everything else (SSM agent, apt, S3, the gateways' outbound
  connections) is `notrack`, so a SYN flood that fills the conntrack table can't cut off
  management access. `notrack` also means NAT doesn't work on this host; revisit before adding
  Docker or anything else that needs it. The ruleset only touches its own table
  (`inet inbound_limits`). Counters: `sudo nft list chain inet inbound_limits gateway_new`.
- **Logs:** journald is the only log store (`ForwardToSyslog=no`, so `/var/log/syslog` no longer
  gets service logs), persistent, capped at 500 MB and kept at least 2 GB clear of a full disk,
  and rate-limited to 5,000 lines per 30 seconds per service.
- **Access:** `ssh.socket` and `ssh.service` are disabled and masked. Shells go through Session
  Manager. The `SSM-SessionManagerRunShell` document (Session Manager preferences for the whole
  account in us-east-2, where this host is the only managed instance) streams every session
  transcript to the CloudWatch Logs group `/inbound/gateways/ssm-sessions` (90-day retention,
  encrypted with `alias/inbound-gateways-session-logs`), and ends idle sessions after 20 minutes.
  If the host can't write to that group, sessions fail to start; the instance role has exactly
  the permissions it needs. Port forwarding sessions use other documents and aren't logged.
- **Alerts:** the SNS topic `inbound-gateway-alerts` emails `ryan@mandarin3d.com` (override with
  `bunx cdk deploy -c alertEmail=…`; the address must confirm the subscription once). It gets
  the recovery alarm, an alarm when the instance status check fails for 3 minutes, and an
  alarm when the CPU credit balance stays under 20 (the instance runs in unlimited mode, so
  that means sustained load billed as surplus credits), plus their OK transitions. On the host,
  an `OnFailure=` drop-in on `smtp-gateway`, `imap-gateway` and `inbound-certs` runs
  `inbound-alert`, which publishes the unit state (never log lines) with the instance role
  (`sns:Publish` on this topic only). Gateway units go through "failed" on every crash before
  they restart, so alerts are limited to one per unit per 30 minutes. `inbound-disk-check.timer`
  alerts hourly while `/` is at least 85% full. `inbound-health` adds threshold alerts on what users
  hit (backend errors, failed logins, lockouts, crash loops) and a daily report; see
  [Health alerts and daily report](#health-alerts-and-daily-report).
- **Replacement guard:** a CloudFormation stack policy (`scripts/set-stack-policy.sh`)
  denies `Update:Replace` and `Update:Delete` on the instance, the Elastic IP and the EIP
  association, so a stack change that would replace the host or move the IP fails instead.
- **Deploy logs:** when a health check fails, CI gets the unit state and the last 20 journal
  lines, with addresses, URLs with credentials, long tokens and `password=`-style values
  masked. The full journal stays on the host.
- **Recovery:** a CloudWatch alarm on `StatusCheckFailed_System` triggers EC2 auto-recovery
  and alerts. Recovery keeps the instance ID, the EIP and the disk.
- **Deploy trust:** the deploy role trusts a GitHub OIDC token only when `sub` is
  `repo:inboundemail/inbound:environment:production`, `repository_id` is `989702246`,
  `repository_owner_id` is `230610683`, `ref` is `refs/heads/main` and `job_workflow_ref` is
  `inboundemail/inbound/.github/workflows/deploy-gateway-host.yml@refs/heads/main`. AWS STS
  evaluates these GitHub claims directly (condition keys added in 2026-02), so the repository's
  OIDC subject template stays at the default. Another workflow, a branch, a fork or a renamed
  repository can't assume the role. It can read Run Command results only in us-east-2.
  This doesn't stop someone who can push to `main`: protect `main` (pull requests required,
  no force pushes, no bypass for apps) and add a required reviewer to the `production`
  environment.

## Cost (us-east-2, on-demand)

| Item | Monthly |
|---|---|
| t4g.small | ~$12.26 |
| 16 GB gp3 root volume | ~$1.28 |
| Elastic IP (public IPv4) | ~$3.65 |
| Route 53 hosted zone | $0.50 |
| KMS customer-managed keys (`alias/inbound-gateways`, `alias/inbound-gateways-session-logs`) | ~$2.00 |
| CloudWatch alarms (3) | ~$0.30 |
| S3, SSM standard parameters, KMS requests, SNS, session logs, Run Command | ~$0 |
| **Total** | **~$20.00** |

The two old boxes cost about $27/month (t4g.micro, t4g.small, 2 EIPs, 2 volumes).

## First-time setup

Run these from `infra/gateways` with admin credentials for account 375612485665 (for
example, `export AWS_PROFILE=inbound AWS_REGION=us-east-2`).

1. Install dependencies, then confirm the account is CDK-bootstrapped (expect `18` or higher):

   ```sh
   bun install
   aws ssm get-parameter --name /cdk-bootstrap/hnb659fds/version --query Parameter.Value --output text
   # if missing: bunx cdk bootstrap aws://375612485665/us-east-2
   ```

2. Optionally refresh the pinned AMI in `lib/config.ts`, then deploy:

   ```sh
   aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text
   bunx cdk diff
   bunx cdk deploy InboundGatewayHost
   aws cloudformation describe-stacks --stack-name InboundGatewayHost --query 'Stacks[0].Outputs' --output table
   ```

3. Lock the host against replacement. The script reads the logical IDs of the instance, the
   EIP and the EIP association from the synthesized template and sets the stack policy:

   ```sh
   ./scripts/set-stack-policy.sh --dry-run   # review the policy
   ./scripts/set-stack-policy.sh
   ```

4. Add the Vercel DNS records. Use the six `vercel dns add …` commands from the
   `VercelAcmeNs1-4` and `VercelAcmeCname*` outputs: 4 NS records for `acme`, plus
   `_acme-challenge.smtp` and `_acme-challenge.imap`. Then check them:

   ```sh
   dig +short NS acme.inboundemail.com
   dig +short CNAME _acme-challenge.smtp.inboundemail.com   # smtp.acme.inboundemail.com.
   dig +short CNAME _acme-challenge.imap.inboundemail.com   # imap.acme.inboundemail.com.
   ```

5. Put the secrets. Values come from env vars or a hidden prompt and are never echoed.
   Copy them from the old boxes' `/etc/inbound/*.env` or the password manager. A
   per-gateway value overrides a `shared` one. The script encrypts with
   `alias/inbound-gateways`. The host can't decrypt a SecureString written with any other
   key, so write every value with this script.

   ```sh
   ./scripts/put-secrets.sh shared MAILBOX_GATEWAY_AUTH_SECRET INBOUND_API_BASE_URL
   ./scripts/put-secrets.sh imap DATABASE_URL        # imap_gateway role (packages/imap-gateway/deploy/provision-db-role.sql)
   ```

   Any other variable the gateway reads in its `src/config.ts` (for example
   `SMTP_MAX_CONNECTIONS`) can be stored the same way under `smtp/` or `imap/`. A new
   variable must also be added to that gateway's `allowed` list in
   `host/sbin/inbound-render-env`. Every tunable limit is allowlisted, including the SMTP
   DATA, parse and session limits (`SMTP_MAX_DATA_PER_CREDENTIAL`, `SMTP_MAX_DATA_PER_IP`,
   `SMTP_MAX_BUFFERED_BYTES`, `SMTP_DATA_TIMEOUT_MS`, `SMTP_PARSE_TIMEOUT_MS`,
   `SMTP_MAX_CONCURRENT_PARSES`, `SMTP_PARSE_HEAP_MB`, `SMTP_MAX_MIME_PARTS`,
   `SMTP_PREAUTH_TIMEOUT_MS`, `SMTP_MAX_SESSION_MS`) and the IMAP handshake, auth, FETCH
   budget and session limits (`IMAP_TLS_HANDSHAKE_TIMEOUT_MS`, `IMAP_AUTH_TIMEOUT_MS`,
   `IMAP_AUTH_FAILURE_RECORDS`, `IMAP_FETCH_MEMORY_BUDGET_BYTES`, `IMAP_FETCH_BUDGET_WAIT_MS`,
   `IMAP_SESSION_REVALIDATE_MS`, `IMAP_SESSION_MAX_AGE_MS`). Defaults and meanings are in
   `packages/smtp-gateway/README.md` and `packages/imap-gateway/src/config.ts`.

6. Set the workflow variables on the `production` environment from the stack outputs:

   ```sh
   gh variable set GATEWAY_HOST_INSTANCE_ID --env production --body <InstanceId>
   gh variable set GATEWAY_ARTIFACT_BUCKET --env production --body <ArtifactBucketName>
   gh variable set GATEWAY_HOST_IP --env production --body <ElasticIp>
   ```

7. Confirm the SNS subscription from the email AWS sends to the alert address.

8. Check that bootstrap finished. The log should contain `done`, possibly followed by the
   one-time `first bootstrap: reboot required …` line (the host is back a minute later).

   ```sh
   aws ssm start-session --target <InstanceId>     # needs the Session Manager plugin
   sudo tail -n 30 /var/log/inbound-bootstrap.log
   ```

9. Deploy the code for the first time. The first deploy also issues the certificates,
   because `inbound-deploy` runs `inbound-certs` when a gateway has no certificate yet.

   ```sh
   gh workflow run deploy-gateway-host.yml -f gateway=both
   # or locally:
   eval "$(./scripts/build-artifact.sh both)" && GATEWAY_HOST_INSTANCE_ID=… GATEWAY_ARTIFACT_BUCKET=… ./scripts/deploy.sh both "$artifact"
   ```

   To issue or renew certificates by hand on the host:
   `sudo inbound-certs all --no-random-sleep`.

10. Verify against the new IP, using the real hostnames for SNI:

   ```sh
   ./scripts/verify.sh <ElasticIp>
   ```

## Operations

- **Logs:** `journalctl -u smtp-gateway -u imap-gateway -f`; certs: `journalctl -u inbound-certs`;
  bootstrap: `/var/log/inbound-bootstrap.log`.
- **Host changes** (`host/`): `bunx cdk deploy` publishes a new bundle and its manifest. The
  next code deploy verifies and applies it, or run `sudo inbound-host-sync` on the host. Gateway
  unit changes take effect on the next deploy or restart. A deploy that fails with
  `REFUSING host bundle` means the bundle in S3 doesn't match what the stack synthesized:
  don't work around it, find out who wrote the object. (While `cdk deploy` is updating the
  stack, `bundle-url` and `bundle-sha256` can briefly disagree; re-run the deploy after it
  finishes.)
- **Session transcripts:** `aws logs tail /inbound/gateways/ssm-sessions --since 1d`.
- **Alerts:** `journalctl -u 'inbound-alert@*'` shows what the host sent or suppressed;
  `journalctl -u inbound-health-check -u inbound-health-report` the health check's.
- **Secret rotation:** run `put-secrets.sh`, then redeploy. Every deploy re-renders the
  env files.
- **Rollback:** re-run the workflow from the previous commit. Releases already on the host
  are reused without reinstalling.
- **AMI changes** replace the instance. Set `verifyHostBundleInUserData: true` in
  `lib/config.ts` in the same change. Run `./scripts/set-stack-policy.sh --unlock`, turn
  off termination protection, deploy, re-run steps 8–10, turn protection back on, and run
  `./scripts/set-stack-policy.sh` again. The EIP is a separate resource and follows the new
  instance.

## Health alerts and daily report

`inbound-health` (`host/sbin`) reads the `smtp-gateway` and `imap-gateway` journals and publishes
through `inbound-alert --publish`, so it uses the same topic, instance role (`sns:Publish` on
`inbound-gateway-alerts` only) and per-key rate limit (`ALERT_MIN_INTERVAL_SECONDS`, 30 minutes).
Messages carry counts, error codes, timings and client IPs only (at most the top 3 to 5): never log
lines, addresses, usernames, credential IDs or message content. The gateways log credentials only as
the first 12 hex characters of a SHA-256, which the report uses to count distinct credentials.

- **`inbound-health-check.timer`** (every 10 minutes) counts the journal since the previous check
  (at most an hour back) and alerts per gateway when a count reaches its threshold. One email lists
  every current problem, and is sent when at least one of them hasn't been reported in the last 30
  minutes, so a new problem breaks through while an ongoing one repeats at most every 30 minutes.
- **`inbound-health-report.timer`** (13:00 UTC) sends a summary of the last 24 hours per gateway:
  connections, logins (ok, failed, distinct credentials), top failing IPs, lockouts and per-IP
  rejects, backend errors by code, TLS failures, restarts, crashes and OOM kills, IMAP sessions
  dropped by revalidation, SMTP messages relayed and rejected with DATA p50/p95, SMTP API non-2xx
  statuses, release, certificate days left, memory and open files, deploys (journal tag
  `inbound-deploy` written by root, `_UID=0`), disk and journal usage.
- State is in `/var/lib/inbound-health` (window start, NRestarts, last time each error code was
  seen). On the first run the previous 24 hours become the baseline for "new error code".
- Try it on the host without sending anything: `sudo inbound-health check --dry-run` or
  `sudo inbound-health report --dry-run`.

| Threshold (`host/host.env`) | Default | Alert when, since the previous check |
|---|---|---|
| `HEALTH_BACKEND_ERRORS` | 20 | backend errors reach this many |
| `HEALTH_NEW_ERROR_LOOKBACK_HOURS` | 24 | an error code that wasn't seen in this many hours appears at least twice, or once for codes that can't be transient (Postgres classes 42 and 28, such as `42883` and `42P01`, and `api_403_auth`) |
| `HEALTH_AUTH_FAILURES` | 50 | failed logins reach this many |
| `HEALTH_AUTH_FAILURES_PER_IP` | 20 | one client IP reaches this many failed logins |
| `HEALTH_THROTTLED` | 10 | login lockouts plus per-IP connection rejects reach this many |
| `HEALTH_TLS_FAILURES` | 100 | TLS handshake failures reach this many |
| `HEALTH_RESTARTS` | 1 | automatic restarts (journal or NRestarts) reach this many; 0 disables (the only threshold that can be 0) |
| `HEALTH_CRASH_LOOP_RESTARTS` | 3 | as above, reported as a crash loop |
| `HEALTH_SESSION_DROPS` | 20 | IMAP sessions logged out by revalidation reach this many |
| `HEALTH_MEMORY_PERCENT` | 85 | memory reaches this share of `MemoryMax` (checked now) |
| `HEALTH_FD_PERCENT` | 80 | open files reach this share of `LimitNOFILE` (checked now) |

Every other threshold must be at least 1 (a 0 would alert on every run), otherwise its default
applies. Any OOM kill alerts, and so does a gateway that has a release but isn't running. To change a
threshold without a stack deploy, put a plain String parameter under `/inbound/gateways/health/`
(for example `aws ssm put-parameter --name /inbound/gateways/health/HEALTH_AUTH_FAILURES --type String --value 100`).
`inbound-render-env health` writes the allowlisted names with whole-number values to
`/etc/inbound/health.env` (root only) on the next deploy or host sync, and skips anything else with
a warning. Without overrides the `host.env` defaults apply.

What counts as what, from the gateway logs:

| Count | IMAP | SMTP |
|---|---|---|
| connections | imap-core `[id] Secure connection from …` | `event=connect` |
| logins, failing IPs | `event=auth result=ok\|fail ip=` (from `limits.ts`; imap-core's own login lines log the PTR hostname instead of the IP when reverse DNS resolves, so they aren't used) | `event=auth result=ok\|fail ip=` |
| lockouts, per-IP rejects | `event=auth_throttled`, `event=conn_limit` | `event=auth result=throttled`, `event=conn_limit` |
| backend errors (code) | `[imap] backend error <SQLSTATE>`, `Authentication error` (`auth_unavailable`), notifier, session revalidation, `server error`, certificate reload | `event=api status=<5xx>\|timeout\|network` (`api_<status>`), a 403 from the auth endpoint (`api_403_auth`), parse worker, mapping, unexpected and fatal errors |
| TLS failures | imap-core `TLS handshake failed from <ip>: <code>` | `event=tls_fail` (implicit TLS on 465) |
| sessions dropped | `event=session_dropped reason=…` | |
| timings | none logged yet | `event=data result=ok ms=` (DATA to reply) |
| restarts | systemd `Scheduled restart job`, `Failed with result`, NRestarts | same |

`event=` lines come from `logEvent` in `packages/smtp-gateway/src/log.ts` and
`packages/imap-gateway/src/log.ts`. If a log line these patterns match changes, update `scan()` in
`host/sbin/inbound-health` in the same change.

## Cutover and decommission (done)

DNS moved to the new host on 2026-10-21. Since then:

- The old boxes (`i-0c10ded783a5ec476`, `i-04fe4bfb9009b39e5`) are terminated, their Elastic
  IPs (18.221.244.100, 18.223.141.122) released, and their security groups, the
  `inbound-smtp-gateway` key pair, the `github-gateway-deploy` role and the old workflow
  `deploy-gateways.yml` deleted. The `production` environment secrets `GATEWAY_DEPLOY_SSH_KEY`
  and `GATEWAY_KNOWN_HOSTS` are gone; the workflow uses only the environment variables from
  setup step 6. No images of the old boxes were kept. Their root volumes were unencrypted and
  held secrets, so never make an AMI of such a volume: if an image is ever needed, snapshot,
  `aws ec2 copy-snapshot --encrypted --kms-key-id <key>`, and delete the unencrypted snapshot.
- There is no rollback to the old boxes.

Still to do (unless already done):

1. ~~Delete `packages/*/deploy/deploy.sh` and `packages/*/deploy/*.service`~~ Done
   (`packages/imap-gateway/deploy/provision-db-role.sql` is kept).
2. Rotate `MAILBOX_GATEWAY_AUTH_SECRET` and the `imap_gateway` database password, because
   the old boxes held them: `./scripts/put-secrets.sh`, then redeploy.
