# @inboundemail/smtp-gateway

Standalone SMTP submission gateway for `smtp.inboundemail.com`. Accepts mail from any SMTP client, authenticates with an Inbound API key, and relays through the existing `POST /api/e2/emails` pipeline (all guards, quotas, and billing apply unchanged). No database or app dependencies — it only talks to the HTTP API, so it deploys anywhere.

## Client usage

```
Host:     smtp.inboundemail.com
Port:     587 (STARTTLS) or 465 (implicit TLS)
Username: inbound
Password: <your Inbound API key>
```

Nodemailer example:

```ts
const transporter = nodemailer.createTransport({
  host: "smtp.inboundemail.com",
  port: 465,
  secure: true,
  auth: { user: "inbound", pass: process.env.INBOUND_API_KEY },
});
```

## How it works

1. AUTH PLAIN/LOGIN (TLS required) — username must be `inbound`, password is the API key. Verified with a lightweight authenticated GET against the API; successful keys are cached in memory for 5 minutes.
2. DATA — raw MIME is parsed (mailparser), mapped to the send-API JSON shape (from/to/cc/bcc from envelope + headers, html/text, reply-to, In-Reply-To/References/X-* headers, attachments as base64), and POSTed with the API key as the Bearer token and a content-derived `Idempotency-Key`.
3. API errors map to SMTP responses: 429 → 451 (retry), 413 → 552, other 4xx → 550, 5xx → 451. Domain-ownership, blocklist, ban, and billing enforcement all happen in the API.

Per-IP AUTH-failure throttling (default 10 failures / 15 min → 421) is built in.

## Configuration (env)

| Variable | Default | Notes |
|---|---|---|
| `INBOUND_API_BASE_URL` | `https://inbound.new/api/e2` | |
| `INBOUND_AUTH_CHECK_PATH` | `/domains?limit=1` | Cheap authenticated GET used to validate keys at AUTH time |
| `INBOUND_SEND_PATH` | `/emails` | |
| `SMTP_HOSTNAME` | `smtp.inboundemail.com` | EHLO/banner name |
| `SMTP_STARTTLS_PORT` | `587` | `0` disables |
| `SMTP_IMPLICIT_TLS_PORT` | `465` | `0` disables; requires TLS paths |
| `SMTP_TLS_KEY_PATH` / `SMTP_TLS_CERT_PATH` | — | Let's Encrypt fullchain + privkey |
| `SMTP_MAX_MESSAGE_BYTES` | `26214400` (25 MB) | |
| `SMTP_ALLOW_INSECURE_AUTH` | `false` | Local dev only |
| `SMTP_AUTH_FAILURE_LIMIT` / `SMTP_AUTH_FAILURE_WINDOW_MS` | `10` / `900000` | Per-IP throttle |

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
