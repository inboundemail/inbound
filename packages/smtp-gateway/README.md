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

1. AUTH PLAIN/LOGIN (TLS required; not advertised before STARTTLS) — the username is the managed login address and the password is its managed credential. Both are verified through `POST /mailboxes/authenticate-smtp`; successful credentials retain their authorized sending identity or scoped domains. Read-only credentials (`accessMode` other than `read_write`) cannot send and are refused at AUTH with `535 5.7.8 This credential is read-only`; this is not counted as a failed login.
2. MAIL FROM / RCPT TO — sender authorization and the per-message recipient limit are enforced before DATA. The sender domain is the part after the last `@`, compared in ASCII (punycode) form against the credential's identity or scoped domains, so IDN senders match however the client or MIME header spells them. Accepted envelope recipients are the sole delivery authority; MIME To/Cc addresses outside that envelope are discarded and remaining envelope recipients stay Bcc.
3. DATA — the body is buffered first (capped by `SMTP_MAX_MESSAGE_BYTES`, with all buffered bodies together capped by `SMTP_MAX_BUFFERED_BYTES`), then a processing slot is taken only for parsing and the API request. Raw MIME is parsed (mailparser) in a fresh worker thread, mapped to the send-API JSON shape, and POSTed with the credential as the Bearer token and an idempotency key derived from its stable credential ID, message, normalized sender, and normalized recipient set. Messages with more than `SMTP_MAX_MIME_PARTS` MIME parts or a header block of about 1 MiB or more are refused with `554 5.6.0` before parsing, and parsing that does not finish within `SMTP_PARSE_TIMEOUT_MS` or exceeds the worker's heap limit is refused with `554 5.6.0` and frees its slot. Inline images stay `cid:` references and are sent as attachments with `content_id`; HTML is not converted to text, so HTML-only messages are sent without a text part.
4. API errors map to SMTP responses: 409/429 → 451 (retry), 413 → 552, other 4xx → 550, 5xx/network timeouts → 451; an unreachable auth backend → 454. Messages are rebuilt by the API, so header values are stripped of line breaks, display names of `<>"\`, and `X-SES-*` headers are dropped. Domain-ownership, blocklist, ban, and billing enforcement all happen in the API.
5. S/MIME detached-signed messages (`multipart/signed` with a PKCS#7 signature protocol) are instead POSTed base64-encoded with their envelope recipients to `POST /emails/raw` (hidden, managed credentials only, gateway secret when configured), which applies the same guards but relays the original bytes: only top-level headers change (From canonicalized, Bcc/Sender/Return-Path/Resent-*/X-SES-* removed, Date added if missing), so the signature still verifies. If the API has no raw endpoint (404), the gateway falls back to the rebuilt JSON send without the signature.

AUTH failures are throttled per login/IP pair and at a higher aggregate per-IP threshold; recently successful users remain exempt from the aggregate threshold. When the failure table is full, expired records go first, then the oldest unblocked record (then the oldest record); a login with no record is never refused because the table is full.

Parsing runs in a `worker_threads` worker spawned per message (about 50 ms of overhead) with `resourceLimits` (old generation `SMTP_PARSE_HEAP_MB`, young generation a quarter of it, 4 MB stack) and is terminated at `SMTP_PARSE_TIMEOUT_MS` or when the session goes away, so a hostile message can't block the event loop or grow the gateway's heap. At most `SMTP_MAX_CONCURRENT_PARSES` workers run at once, which keeps their worst case inside the unit's `MemoryMax`. Node enforces `resourceLimits`; Bun (tests) ignores them. An uncaught exception or unhandled rejection in the main thread logs and exits with status 70, and systemd restarts the service.

Abuse limits:

- Connections are counted per client address on the raw TCP socket of both listeners, before the TLS handshake and before an SMTP session exists; sockets over `SMTP_MAX_CONNECTIONS_PER_IP` are closed immediately.
- A session must authenticate within `SMTP_PREAUTH_TIMEOUT_MS` and may last at most `SMTP_MAX_SESSION_MS`; either deadline closes it with `421 4.4.2`. A message in flight when the session expires gets its reply first, and the session closes right after.
- Each credential may transfer `SMTP_MAX_DATA_PER_CREDENTIAL` (3) and each client address `SMTP_MAX_DATA_PER_IP` (4) messages at once; further concurrent DATA gets `451 4.3.2` and is retried by the client.
- A DATA transfer, including queueing and processing, must finish within `SMTP_DATA_TIMEOUT_MS` of the DATA command, or the gateway answers `451 4.4.2` and closes the connection. A request already sent upstream when the deadline passes still completes; the client's retry reuses the same idempotency key.

Advertised extensions: PIPELINING, 8BITMIME, SIZE, STARTTLS (587), AUTH (after TLS). SMTPUTF8, DSN and ENHANCEDSTATUSCODES are not offered; unsupported MAIL/RCPT parameters are rejected with 555 and non-ASCII mailboxes with 553.

## Configuration (env)

| Variable | Default | Notes |
|---|---|---|
| `INBOUND_API_BASE_URL` | `https://inbound.new/api/e2` | Base URL for managed-credential authentication and sending |
| `INBOUND_SEND_PATH` | `/emails` | Send endpoint relative to the API base URL |
| `INBOUND_RAW_SEND_PATH` | `/emails/raw` | Raw relay endpoint for S/MIME signed messages |
| `SMTP_HOSTNAME` | `smtp.inboundemail.com` | EHLO/banner name |
| `SMTP_STARTTLS_PORT` | `587` | `0` disables |
| `SMTP_IMPLICIT_TLS_PORT` | `465` | `0` disables; always requires both TLS paths |
| `SMTP_TLS_KEY_PATH` / `SMTP_TLS_CERT_PATH` | — | Both paths are required unless insecure development mode is explicitly enabled; minimum TLS 1.2 |
| `SMTP_TLS_HANDSHAKE_TIMEOUT_MS` | `5000` | Implicit TLS handshake timeout (STARTTLS upgrades are bounded by the socket timeout) |
| `SMTP_MAX_MESSAGE_BYTES` | `3145728` (3 MiB) | Maximum accepted DATA size; keeps the JSON submission under the API's 4.5 MB request limit |
| `SMTP_MAX_RECIPIENTS` | `50` | Maximum distinct accepted envelope recipients; cannot exceed the SES limit of 50 |
| `SMTP_ALLOW_INSECURE_AUTH` | `false` | Explicit plaintext local-development override only |
| `SMTP_AUTH_FAILURE_LIMIT` / `SMTP_AUTH_FAILURE_WINDOW_MS` | `10` / `900000` | Per-login/IP failure threshold and window |
| `SMTP_AUTH_FAILURE_IP_LIMIT` | `50` | Higher aggregate failure threshold per IP |
| `SMTP_MAX_AUTH_FAILURE_RECORDS` | `10000` | Maximum retained failure records and successful-login exemptions |
| `SMTP_AUTH_REQUEST_TIMEOUT_MS` / `SMTP_SEND_REQUEST_TIMEOUT_MS` | `10000` / `30000` | Independent upstream authentication and send timeouts |
| `SMTP_SOCKET_TIMEOUT_MS` | `60000` | SMTP socket inactivity timeout |
| `SMTP_MAX_CONNECTIONS` | `500` | Maximum simultaneous TCP and SMTP connections per listener |
| `SMTP_MAX_CONNECTIONS_PER_IP` | `10` | Maximum simultaneous TCP connections per client address across both listeners, enforced before TLS |
| `SMTP_PREAUTH_TIMEOUT_MS` | `30000` | Absolute deadline from connect to successful AUTH |
| `SMTP_MAX_SESSION_MS` | `600000` | Maximum SMTP session lifetime |
| `SMTP_MAX_CONCURRENT_DATA` / `SMTP_MAX_DATA_QUEUE` | `8` / `20` | Concurrent parse-and-send slots and the bounded queue of complete messages waiting for one |
| `SMTP_MAX_DATA_PER_CREDENTIAL` / `SMTP_MAX_DATA_PER_IP` | `3` / `4` | Concurrent DATA transfers per credential and per client address |
| `SMTP_MAX_BUFFERED_BYTES` | `67108864` (64 MiB) | Total bytes of message bodies held in memory at once; must be at least `SMTP_MAX_MESSAGE_BYTES` |
| `SMTP_DATA_TIMEOUT_MS` | `120000` | Absolute deadline for a DATA transfer, from the DATA command to the reply |
| `SMTP_PARSE_TIMEOUT_MS` | `15000` | MIME parsing deadline per message; the parse worker is terminated when it passes |
| `SMTP_MAX_CONCURRENT_PARSES` | `2` | Parse workers running at once (within the DATA slots) |
| `SMTP_PARSE_HEAP_MB` | `64` | Old-generation heap limit of each parse worker (32–1024); a 3 MiB message needs about 32 |
| `SMTP_MAX_MIME_PARTS` | `500` | Lines starting with `--` that aren't only dashes, plus encapsulated message headers, allowed per message (at most 900); counted before parsing |

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

## Deployment

Production runs this package under Node 24 with systemd on the shared gateway host, behind `smtp.inboundemail.com:465/587`. The host, unit (`infra/gateways/host/systemd/smtp-gateway.service`), environment rendering and certificates live in [`infra/gateways`](../../infra/gateways/README.md); see its setup and operations sections.
