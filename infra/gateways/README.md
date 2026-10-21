# Gateway host

One EC2 instance runs both protocol gateways: `packages/smtp-gateway` (465, 587) and
`packages/imap-gateway` (993). This CDK app (`InboundGatewayHost`, us-east-2,
account 375612485665) replaces the two hand-built boxes. Those boxes keep running, and
keep deploying through `deploy-gateways.yml`, until DNS cutover.

## Architecture

```
GitHub Actions (production env, OIDC)
  └─ role github-gateway-host-deploy: s3:PutObject releases/*, ssm:SendCommand (this instance + InboundGatewayDeploy only)
       ├─ upload releases/<gateway>-<sha>.tar.gz  ──►  S3 artifact bucket (private, versioned, 90-day expiry)
       └─ ssm send-command InboundGatewayDeploy(gateway, s3Key, sha256)
                                  │
EC2 t4g.small, Ubuntu 24.04 arm64, Elastic IP, IMDSv2, no SSH (SSM only)
  inbound-host-sync    re-applies the host bundle (infra/gateways/host, a CDK asset) when it changed
  inbound-deploy       download → verify sha256 → bun install → switch symlink → restart → health check → roll back on failure
  inbound-render-env   SSM /inbound/gateways/{shared,<gateway>}/* (allowlisted names) → /etc/inbound/<gateway>-gateway.env
  inbound-certs        lego DNS-01 via Route 53, daily timer, installs certs into /etc/inbound/tls/<gateway>/versions/, switches the live symlink
  smtp-gateway.service (user smtpgw, MemoryMax 384M)   imap-gateway.service (user imapgw, MemoryMax 1200M)
```

- **Runtime:** Node 24 runs the gateways, as on the old boxes (`node src/index.ts`).
  Bun 1.4.2 installs dependencies only (`--frozen-lockfile --production --ignore-scripts`,
  as the unprivileged `inboundbuild` user, in a `systemd-run` scope capped at 512 MB so an
  install can't push the running gateways out of memory). Bun, Node and lego are pinned in
  `host/host.env` and installed only after their SHA-256 checksums match. A 2 GB swapfile
  (`vm.swappiness=10`) absorbs spikes; the gateway units themselves never swap
  (`MemorySwapMax=0`).
- **Isolation:** the gateway units run with `IPAddressDeny=169.254.169.254/32 fd00:ec2::254/128`,
  so the gateway processes can't reach the instance metadata service or the instance role's
  credentials. The gateways make no AWS calls.
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
- **Replacement guard:** a CloudFormation stack policy (`scripts/set-stack-policy.sh`)
  denies `Update:Replace` and `Update:Delete` on the instance, the Elastic IP and the EIP
  association, so a stack change that would replace the host or move the IP fails instead.
- **Deploy logs:** when a health check fails, CI gets the unit state and the last 20 journal
  lines, with addresses, URLs with credentials, long tokens and `password=`-style values
  masked. The full journal stays on the host.
- **Recovery:** a CloudWatch alarm on `StatusCheckFailed_System` triggers EC2 auto-recovery.
  Recovery keeps the instance ID, the EIP and the disk.

## Cost (us-east-2, on-demand)

| Item | Monthly |
|---|---|
| t4g.small | ~$12.26 |
| 16 GB gp3 root volume | ~$1.28 |
| Elastic IP (public IPv4) | ~$3.65 |
| Route 53 hosted zone | $0.50 |
| KMS customer-managed key (`alias/inbound-gateways`) | ~$1.00 |
| S3, SSM standard parameters, KMS requests, alarm, Run Command | ~$0 |
| **Total** | **~$18.70** |

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
   `host/sbin/inbound-render-env`.

6. Set the workflow variables on the `production` environment from the stack outputs:

   ```sh
   gh variable set GATEWAY_HOST_INSTANCE_ID --env production --body <InstanceId>
   gh variable set GATEWAY_ARTIFACT_BUCKET --env production --body <ArtifactBucketName>
   gh variable set GATEWAY_HOST_IP --env production --body <ElasticIp>
   ```

7. Check that bootstrap finished. The log should contain `done`, possibly followed by the
   one-time `first bootstrap: reboot required …` line (the host is back a minute later).

   ```sh
   aws ssm start-session --target <InstanceId>     # needs the Session Manager plugin
   sudo tail -n 30 /var/log/inbound-bootstrap.log
   ```

8. Deploy the code for the first time. The first deploy also issues the certificates,
   because `inbound-deploy` runs `inbound-certs` when a gateway has no certificate yet.

   ```sh
   gh workflow run deploy-gateway-host.yml -f gateway=both
   # or locally:
   eval "$(./scripts/build-artifact.sh both)" && GATEWAY_HOST_INSTANCE_ID=… GATEWAY_ARTIFACT_BUCKET=… ./scripts/deploy.sh both "$artifact"
   ```

   To issue or renew certificates by hand on the host:
   `sudo inbound-certs all --no-random-sleep`.

9. Verify against the new IP, using the real hostnames for SNI:

   ```sh
   ./scripts/verify.sh <ElasticIp>
   ```

## Operations

- **Logs:** `journalctl -u smtp-gateway -u imap-gateway -f`; certs: `journalctl -u inbound-certs`;
  bootstrap: `/var/log/inbound-bootstrap.log`.
- **Host changes** (`host/`): `bunx cdk deploy` publishes a new bundle. The next code deploy
  applies it, or run `sudo inbound-host-sync` on the host. Gateway unit changes take
  effect on the next deploy or restart.
- **Secret rotation:** run `put-secrets.sh`, then redeploy. Every deploy re-renders the
  env files.
- **Rollback:** re-run the workflow from the previous commit. Releases already on the host
  are reused without reinstalling.
- **AMI changes** replace the instance. Run `./scripts/set-stack-policy.sh --unlock`, turn
  off termination protection, deploy, re-run steps 7–9, turn protection back on, and run
  `./scripts/set-stack-policy.sh` again. The EIP is a separate resource and follows the new
  instance.

## Cutover

1. `verify.sh <ElasticIp>` passes for both gateways, and both hosts run the same commit.
2. The `smtp` and `imap` A records already have a 60-second TTL. Point them at the new IP.
   Add the new record before removing the old one, so a client resolves to one of two
   working hosts during the switch:

   ```sh
   vercel dns ls inboundemail.com | grep -E '\s(smtp|imap)\s'
   vercel dns add inboundemail.com smtp A <ElasticIp>
   vercel dns add inboundemail.com imap A <ElasticIp>
   vercel dns rm <old smtp record id>     # 18.221.244.100
   vercel dns rm <old imap record id>     # 18.223.141.122
   ```

3. Verify: `dig +short smtp.inboundemail.com @ns1.vercel-dns.com`, then
   `./scripts/verify.sh "$(dig +short smtp.inboundemail.com)"`, and send a test message and
   check IMAP with a real client.
4. Watch the new host: `journalctl -u smtp-gateway -u imap-gateway -f`. IMAP IDLE clients
   stay connected to the old box until they reconnect. After about 10 minutes, restart
   `imap-gateway` on the old box to move them over.
5. **Rollback:** add the old A records back (18.221.244.100 for smtp, 18.223.141.122 for
   imap) and remove the new ones. Clients follow within the 60-second TTL.
6. Once the new host has been stable for a day, add a `push` trigger to
   `deploy-gateway-host.yml` (with the same `paths` as the old workflow), and delete
   `deploy-gateways.yml`.

## Decommission the old boxes

Do this after at least 48 hours on the new host.

1. Snapshot both root volumes:
   `aws ec2 create-image --no-reboot --instance-id i-0c10ded783a5ec476 --name inbound-smtp-gateway-final`
   (and the same for `i-04fe4bfb9009b39e5`, named `inbound-imap-gateway-final`).
2. Terminate: `aws ec2 terminate-instances --instance-ids i-0c10ded783a5ec476 i-04fe4bfb9009b39e5`.
3. Release the EIPs:
   `aws ec2 describe-addresses --public-ips 18.221.244.100 18.223.141.122 --query 'Addresses[].AllocationId'`,
   then `aws ec2 release-address --allocation-id <id>` for each.
4. Delete the security groups `sg-08f184ab834042662` and `sg-050924ef2d471c8cd`.
5. Delete the old deploy path:
   - `.github/workflows/deploy-gateways.yml`
   - `packages/*/deploy/deploy.sh` and `packages/*/deploy/*.service` (keep `provision-db-role.sql`)
   - the GitHub secrets `GATEWAY_DEPLOY_SSH_KEY` and `GATEWAY_KNOWN_HOSTS`
   - the `github-gateway-deploy` role and its policies
   - the `inbound-smtp-gateway` EC2 key pair and every local copy of the `.pem`
