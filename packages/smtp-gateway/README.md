# @inboundemail/smtp-gateway

Standalone SMTP submission gateway for `smtp.inboundemail.com`. Accepts mail from any SMTP client, authenticates managed mailbox or SMTP credentials, and relays through the existing `POST /api/e2/emails` pipeline (all guards, quotas, and billing apply unchanged). No database or app dependencies — it only talks to the HTTP API, so it deploys anywhere.

## Client usage

```
Host:     smtp.inboundemail.com
Port:     587 (STARTTLS) or 465 (implicit TLS)
Username: <managed mailbox or SMTP login address>
Password: <managed mailbox or SMTP credential password>
```

Nodemailer example:

```ts
const transporter = nodemailer.createTransport({
  host: "smtp.inboundemail.com",
  port: 465,
  secure: true,
  auth: { user: process.env.INBOUND_SMTP_LOGIN, pass: process.env.INBOUND_SMTP_PASSWORD },
});
```

## How it works

1. AUTH PLAIN/LOGIN (TLS required) — the username is the managed login address and the password is its managed credential. Both are verified through `POST /mailboxes/authenticate-smtp`; successful credentials retain their authorized sending identity or scoped domains.
2. MAIL FROM / RCPT TO — sender authorization and the per-message recipient limit are enforced before DATA. Accepted envelope recipients are the sole delivery authority; MIME To/Cc addresses outside that envelope are discarded and remaining envelope recipients stay Bcc.
3. DATA — raw MIME is parsed (mailparser), mapped to the send-API JSON shape, and POSTed with the credential as the Bearer token and an idempotency key derived from its stable credential ID, message, normalized sender, and normalized recipient set.
4. API errors map to SMTP responses: 429 → 451 (retry), 413 → 552, other 4xx → 550, 5xx/network timeouts → 451. Domain-ownership, blocklist, ban, and billing enforcement all happen in the API.

AUTH failures are throttled per login/IP pair and at a higher aggregate per-IP threshold; recently successful users remain exempt from the aggregate threshold.

## Configuration (env)

| Variable | Default | Notes |
|---|---|---|
| `INBOUND_API_BASE_URL` | `https://inbound.new/api/e2` | Base URL for managed-credential authentication and sending |
| `INBOUND_SEND_PATH` | `/emails` | Send endpoint relative to the API base URL |
| `SMTP_HOSTNAME` | `smtp.inboundemail.com` | EHLO/banner name |
| `SMTP_STARTTLS_PORT` | `587` | `0` disables |
| `SMTP_IMPLICIT_TLS_PORT` | `465` | `0` disables; always requires both TLS paths |
| `SMTP_TLS_KEY_PATH` / `SMTP_TLS_CERT_PATH` | — | Both paths are required unless insecure development mode is explicitly enabled; minimum TLS 1.2 |
| `SMTP_TLS_HANDSHAKE_TIMEOUT_MS` | `10000` | Handshake timeout for implicit TLS and accepted STARTTLS upgrades |
| `SMTP_MAX_MESSAGE_BYTES` | `26214400` (25 MB) | Maximum accepted DATA size |
| `SMTP_MAX_RECIPIENTS` | `50` | Maximum distinct accepted envelope recipients; cannot exceed the SES limit of 50 |
| `SMTP_ALLOW_INSECURE_AUTH` | `false` | Explicit plaintext local-development override only |
| `SMTP_AUTH_FAILURE_LIMIT` / `SMTP_AUTH_FAILURE_WINDOW_MS` | `10` / `900000` | Per-login/IP failure threshold and window |
| `SMTP_AUTH_FAILURE_IP_LIMIT` | `50` | Higher aggregate failure threshold per IP |
| `SMTP_MAX_AUTH_FAILURE_RECORDS` | `10000` | Maximum retained failure records and successful-login exemptions |
| `SMTP_AUTH_REQUEST_TIMEOUT_MS` / `SMTP_SEND_REQUEST_TIMEOUT_MS` | `10000` / `30000` | Independent upstream authentication and send timeouts |
| `SMTP_SOCKET_TIMEOUT_MS` | `60000` | SMTP socket inactivity timeout |
| `SMTP_MAX_CONNECTIONS` | `50` | Maximum simultaneous TCP and SMTP connections per listener |
| `SMTP_MAX_CONCURRENT_DATA` / `SMTP_MAX_DATA_QUEUE` | `2` / `20` | Concurrent message-processing slots and pending queue limit |

## Local dev

```bash
bun install
bun run dev   # plaintext AUTH on :2587, no TLS — dev only
```

Smoke test:

```bash
bunx nodemailer  # or:
openssl s_client -starttls smtp -connect localhost:587
```

## EC2 deployment

One `t4g.micro` (2 vCPU Graviton, 1 GB, ~$6/mo) handles this comfortably — the gateway is a thin proxy (parse + HTTPS POST); the API and SES do the heavy lifting. Use `t4g.small` (~$12/mo) if you want headroom for TLS handshake bursts and larger attachment buffering. Scale-out later = NLB (TCP passthrough, PROXY protocol) in front of 2+ instances across AZs.

1. Launch `t4g.micro`, Amazon Linux 2023 or Ubuntu 24.04 arm64. Security group: inbound TCP 587 + 465 from `0.0.0.0/0`, TCP 80 from `0.0.0.0/0` (ACME only), SSH from your IP. No outbound port 25 needed — delivery is HTTPS to the API, so AWS's outbound-25 block is irrelevant.
2. Allocate an Elastic IP, point `smtp.inboundemail.com` A record at it.
3. Install bun, clone the repo to `/opt/inbound`, `bun install` in this package.
4. Cert: `certbot certonly --standalone -d smtp.inboundemail.com`, then set `SMTP_TLS_CERT_PATH=/etc/letsencrypt/live/smtp.inboundemail.com/fullchain.pem` and `SMTP_TLS_KEY_PATH=.../privkey.pem` in `/etc/inbound/smtp-gateway.env`. Add a `--deploy-hook "systemctl restart smtp-gateway"` for renewals.
5. `useradd -r smtpgw`, install `deploy/smtp-gateway.service` to `/etc/systemd/system/`, `systemctl enable --now smtp-gateway`.

Note: `smtp-server` STARTTLS wraps sockets mid-stream; if Bun's `node:tls` misbehaves on 587, run the same code under Node 22 (`node --experimental-strip-types` or a tsx entry) — the package has no Bun-specific APIs.
