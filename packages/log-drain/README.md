# inbound-log-drain

A Cloudflare Worker that receives the Vercel Log Drain for `inbound.new` and
stores 30 days of redacted, searchable logs. It replaces Vercel Observability
Plus (about $107/month for about 98M events).

This package stands on its own. It does not import anything from the Next.js
app.

```
Vercel Log Drain (NDJSON, signed with HMAC-SHA1)
        │  POST /ingest
        ▼
Worker: check the signature, parse, redact, normalize
        ├─► Pipelines stream ─► R2 sink: gzip NDJSON files, one partition per hour
        │                       logs/year=YYYY/month=MM/day=DD/hour=HH/*.json.gz
        │                       (R2 lifecycle deletes them after 30 days,
        │                        and a daily cron also cleans up)
        └─► Workers Analytics Engine: one data point per request
            (route, method, source, host, region, status, duration)

GET /query    bearer token, scans the hourly partitions newest first
GET /metrics  bearer token: Analytics Engine SQL, or a scan of R2 for short windows
```

If the `LOG_STREAM` binding is missing, as in `--env local`, the Worker writes
one gzip NDJSON object per delivery straight to R2, using the same layout.
Local development and tests use this mode. It is also a fallback for low
volume.

## Why this design (cost at our volume)

Assumptions:

- 100M events/month today, and 10–20M after the planned log-noise cleanup.
- A raw Vercel log record is about 0.8–1.2 KB. Synthetic records with a
  `proxy` object were 763 B, and real messages are longer.
- A normalized record is about 700 B (measured: 140k records came to 95 MB).
  So 100M events ≈ 70 GB/month, and 15M ≈ 10 GB.
- Gzip makes real logs roughly 8× smaller, so 30 days of storage is about
  9 GB at 100M and about 1.3 GB at 15M.
- Vercel sends 1–5M deliveries/month. Batches are at most 1 MB.
- Prices are from the Vercel and Cloudflare docs as of 2026-10.

**Vercel bills the drain itself.** Drains cost $0.50/GB on Pro, with nothing
included. The bill is measured as the uncompressed JSON of every record that
leaves Vercel, after filters and sampling. This line is the biggest cost
whichever storage design is used, so cutting volume on the Vercel side (see
the end of this file) matters most.

| | 100M events/mo | 15M events/mo |
|---|---|---|
| **Vercel Drains volume** ($0.50/GB of raw JSON) | **≈ $40–60** | **≈ $6–9** |
| Workers Paid base (needed for Pipelines and for CPU above 10 ms) | $5.00 | $5.00 |
| Worker requests (1–5M; 10M included) | $0 | $0 |
| Worker CPU (≈13 ms per 1k records measured; 30M ms included) | $0 | $0 |
| Pipelines SQL transform (50 GB included, then $0.04/GB) | $0.80 | $0 |
| Pipelines JSON sink (50 GB included, then $0.03/GB) | $0.60 | $0 |
| R2 storage (10 GB-month free, then $0.015/GB) | ~$0 | $0 |
| R2 Class A/B (sink writes every 5 min, query lists and reads) | $0 | $0 |
| Analytics Engine (not billed yet; later 10M points included, then $0.25/M) | $0 now, later ≤ $7.50 (or $0 with `METRICS_SAMPLE_RATE`) | $0 |
| **Cloudflare subtotal** | **≈ $6.40** | **≈ $5** |
| **Total vs. Observability Plus (~$107)** | **≈ $46–66** | **≈ $11–14** |

If the Cloudflare account already pays for Workers Paid, the Cloudflare
subtotal drops to about $1.40 at 100M events and $0 at 15M.

Getting to $0–5/month needs a drained volume of about 10 GB/month or less,
roughly 10M records or fewer. That means dropping `static`, sampling
successful requests, or both. The alternative is to have the app send its own
logs to this Worker (no drain fee), at the cost of losing Vercel's platform
request logs.

Options compared:

- **(a) Runner-up: Pipelines → R2 Data Catalog (Iceberg) + R2 SQL.** This costs
  about the same: roughly $7.5–8/mo at 100M ($5 base, $0.80 transform, $1.20
  Iceberg sink, about $0.30 compaction, $0.10–0.50 SQL scans) and about $5 at
  15M. Its queries are better: real SQL, `LIKE`, and `approx_percentile_cont`,
  so it would not need Analytics Engine. It came second for three reasons:
  - Iceberg has no row TTL, and R2 SQL is read-only. Keeping only 30 days
    would need an outside Iceberg writer (PyIceberg or Spark) to `DELETE` old
    rows and then expire snapshots. An R2 lifecycle rule on Iceberg data files
    would corrupt the table.
  - The Worker would need an account API token with R2 read/write and Data
    Catalog permissions to call R2 SQL.
  - None of it can be tested locally.
- **(b) Chosen: Worker → R2 gzip NDJSON + Analytics Engine.** Pipelines does
  the batching. The variant without Pipelines, one R2 object per delivery,
  costs a Class A write per delivery: 1–5M → $0–18/mo. It also leaves
  thousands of tiny objects per hour for queries to list and read. Pipelines
  batches durably for about $0–1.40.
- **(c) D1 rows.** 100M rows/month is about $50 in row writes, plus one more
  write per index. 30 days × 70 GB is far over D1's 10 GB per-database limit.
  Even at 15M events (about 10 GB per 30 days) it sits at that limit. Rejected.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET/HEAD | `/ingest` | none | Vercel endpoint check. The response includes `x-vercel-verify`. |
| POST | `/ingest` | `x-vercel-signature` | Accepts drain deliveries (JSON array or NDJSON, optionally gzip). |
| GET | `/query` | `Authorization: Bearer $QUERY_TOKEN` | Searches logs. |
| GET | `/metrics` | `Authorization: Bearer $QUERY_TOKEN` | Requests, errors, p50 and p95 per route. |
| GET | `/health` | none | Returns `ok`. |

How `/ingest` handles requests:

- A POST with no signature and an empty body is treated as Vercel's
  verification probe. It gets `200` plus `x-vercel-verify`, and nothing is
  stored.
- An unsigned POST with a body gets `401`.
- A bad signature gets `403`.
- The signature is HMAC-SHA1 over the raw body, compared in constant time.
  For gzip deliveries it is also checked over the inflated body.

`/query` parameters (all optional):

| Param | Example | Notes |
|---|---|---|
| `from`, `to` | `2026-10-21T14:00:00Z`, `1792600000000` | ISO, epoch seconds, or epoch ms. Defaults to the last hour. At most `MAX_QUERY_HOURS` (24) per request. |
| `level` | `error,warning` | Comma-separated list. |
| `source` | `lambda,edge,static` | |
| `path` | `/api/e2/emails` | Prefix of the request path, function path, or normalized route. |
| `status` | `500`, `5xx`, `400-499`, `>=400` | |
| `requestId` | `643af4e3-…` | |
| `q` | `timeout` | Case-insensitive substring of the message or request path. |
| `email` | `user@example.com` | Finds the redacted form of an address (needs `EMAIL_HASH_KEY`). |
| `host` | `inbound.new` | |
| `limit` | `100` | Maximum 1000. Newest first. |

The response is
`{ logs, count, truncated, nextCursor, window, scanned }`.

- To get the next page, repeat the request with the same `from` and filters,
  plus `cursor=<nextCursor>`. The cursor is `(ts, id)`, so records that share
  a millisecond are not lost.
- A query stops at `MAX_SCAN_MB` (1 GB uncompressed) or `MAX_SCAN_OBJECTS`
  (5000) objects. When that happens it returns `truncated: true` and a
  `nextCursor` you can continue from.
- In local measurements, scanning an hour of 140k records (about 95 MB) took
  about 0.3–0.4 s.

`/metrics` takes `from`, `to`, `path`, `source` and `host`.

- It uses Analytics Engine SQL when `CF_ACCOUNT_ID` and `CF_ANALYTICS_TOKEN`
  are set. Windows can then be up to 30 days.
- With Analytics Engine, values cannot contain quotes, backslashes or `%`.
  `level`, `status`, `requestId` and `q` need `engine=scan`.
- Otherwise, or with `engine=scan`, it scans R2. The window is limited to
  24 h, the scan to 256 MB, and grouping to 200k requests. When it hits a
  limit it returns `truncated: true`.
- Requests are grouped by `requestId`.
- `errors` counts status ≥ 500 and Vercel's `-1` (crash). `client_errors`
  counts 4xx.

The Vercel log schema has no latency field. Duration comes from the Lambda
`REPORT … Duration: X ms` line, or from a numeric `duration` or `durationMs`
field when one is present. Routes with neither show `p50_ms: null`.

```sh
curl -s -H "Authorization: Bearer $QUERY_TOKEN" \
  "https://inbound-log-drain.<subdomain>.workers.dev/query?level=error&path=/api/e2&limit=50" | jq
curl -s -H "Authorization: Bearer $QUERY_TOKEN" \
  "https://inbound-log-drain.<subdomain>.workers.dev/metrics?from=$(($(date +%s)-86400))" | jq '.routes[:20]'
```

## What gets stored

Each delivery entry becomes a flat record. `pipeline/schema.json` has the
same fields as the record type.

- Basic fields: `ts`, `id`, `level`, `source`, `type`, `message`,
  `request_id`, `trace_id`, `span_id`, `host`.
- Request fields: `path`, `route` (the request path with IDs replaced by
  `:id`), `entrypoint`, `status`, `method`, `req_path`, `client_ip`,
  `user_agent`, `referer`, `region`, `cache`, `path_type`, `waf_action`,
  `response_bytes`, `duration_ms`.
- Deployment fields: `deployment_id`, `project_id`, `project_name`,
  `environment`, `branch`, `build_id`, `edge_type`, `destination`.

`ja3Digest`/`ja4Digest` are dropped, and messages longer than
`MAX_MESSAGE_CHARS` (32k) are truncated.

Redaction covers `message`, `req_path`, `referer` and `destination`:

- `Bearer`/`Basic`/`Token` credentials
- JWTs
- AWS access key IDs (`AKIA…`, `ASIA…`)
- `mail_…`/`imap_…` Inbound keys
- `sk_`/`rk_`/`sk-`/`whsec_` keys
- GitHub and Slack tokens
- `key=value` and `"key":"value"` pairs for names like `password`,
  `api_key`, `token`, `secret`, `authorization`, `cookie` and `signature`
- Mixed-case tokens of 40 or more characters (Better Auth API keys)
- Email addresses, including URL-encoded `%40` ones: `alice@example.com`
  becomes `a***~1a2b3c4d@example.com`, where the tag is the first 8 hex
  characters of HMAC-SHA256(`EMAIL_HASH_KEY`, address). Without the key it
  becomes `a***@example.com`.
- RFC 5322 Message-IDs look like addresses, so they are masked the same way.
  You can still find one with `?email=<message-id>`, because the tag is
  computed the same way.

`client_ip` is kept on purpose, for abuse investigations. To hide it, turn on
Vercel's team-wide "IP addresses are hidden in your Drains" setting.

Retention:

- Log objects are deleted by an R2 lifecycle rule after 30 days.
- A daily cron (`17 3 * * *`) also deletes day partitions that are 31–37 days
  old.
- Analytics Engine keeps its points (route, status and duration only, no
  message text) for Cloudflare's fixed 3 months.

## Secrets and bindings

| Name | Kind | Required | Notes |
|---|---|---|---|
| `LOGS` | R2 bucket `inbound-logs` | yes | |
| `LOG_STREAM` | Pipelines stream binding | yes in production | Replace `REPLACE_WITH_STREAM_ID` in `wrangler.jsonc`. |
| `METRICS` | Analytics Engine dataset `inbound_requests` | recommended | Created automatically on the first write. |
| `VERCEL_DRAIN_SECRET` | secret | yes | The same value as `delivery.secret` on the Vercel drain. |
| `QUERY_TOKEN` | secret | yes | At least 32 characters. The query API returns 503 until it is set. |
| `EMAIL_HASH_KEY` | secret | recommended | Enables email tags and `?email=` search. |
| `VERCEL_VERIFY_TOKEN` | secret | only if Vercel asks for endpoint verification | Sent back as `x-vercel-verify`. |
| `CF_ANALYTICS_TOKEN` | secret | for `/metrics` over long windows | API token with **Account Analytics: Read**. |
| `CF_ACCOUNT_ID` | var | with the token above | |
| `RETENTION_DAYS`, `MAX_QUERY_HOURS`, `MAX_SCAN_MB`, `MAX_SCAN_OBJECTS`, `INGEST_LAG_MINUTES`, `MAX_MESSAGE_CHARS`, `METRICS_SAMPLE_RATE`, `LOG_PREFIX`, `AE_DATASET` | vars | no | Defaults are in `wrangler.jsonc`. |

## Local development

```sh
cd packages/log-drain
bun install
cp .dev.vars.example .dev.vars   # fill in random values; this file is gitignored
bun run typecheck
bun run test                     # vitest inside workerd (R2-direct mode)
bun run dev                      # wrangler dev --env local on :8787
bun run smoke                    # signed and unsigned sample deliveries, then queries
```

## Deploy (Ryan's personal Cloudflare account, the default `wrangler` profile, not `--profile work`)

Run everything from `packages/log-drain`.

1. Check the account:

   ```sh
   bunx wrangler whoami
   ```

2. Create the bucket and the 30-day lifecycle rule:

   ```sh
   bunx wrangler r2 bucket create inbound-logs
   bunx wrangler r2 bucket lifecycle add inbound-logs expire-logs-30d logs/ --expire-days 30
   ```

3. Create the stream, the sink and the pipeline:

   ```sh
   bunx wrangler basin pipelines streams create inbound_logs_stream \
     --schema-file pipeline/schema.json --http-enabled false
   bunx wrangler basin pipelines sinks create inbound_logs_sink --type r2 --bucket inbound-logs \
     --format json --compression gzip --path logs \
     --partitioning "year=%Y/month=%m/day=%d/hour=%H" --roll-interval 300 --roll-size 100
   bunx wrangler basin pipelines create inbound_logs --sql-file pipeline/pipeline.sql
   bunx wrangler basin pipelines streams get inbound_logs_stream   # copy the stream id
   ```

   Put the stream id into `wrangler.jsonc` → `pipelines[0].stream`.

4. Deploy. The top-level config is production, and `--env=""` targets it
   explicitly:

   ```sh
   bunx wrangler deploy --env="" --dry-run
   bunx wrangler deploy --env=""
   ```

   This prints the `https://inbound-log-drain.<subdomain>.workers.dev` URL.

5. Set the secrets. Each command prompts for its value:

   ```sh
   bunx wrangler secret put QUERY_TOKEN --env=""       # e.g. paste the output of `openssl rand -hex 32`
   bunx wrangler secret put EMAIL_HASH_KEY --env=""
   ```

   For `/metrics` over long windows, also:

   - set `CF_ACCOUNT_ID` in `wrangler.jsonc`
   - run `bunx wrangler secret put CF_ANALYTICS_TOKEN --env=""`
   - deploy again

6. Generate the drain secret once, then store it in Cloudflare and use the
   same value in step 7. Run this in the same shell session as step 7:

   ```sh
   export DRAIN_SECRET="$(openssl rand -hex 32)"
   printf %s "$DRAIN_SECRET" | bunx wrangler secret put VERCEL_DRAIN_SECRET --env=""
   ```

7. Optionally, have Vercel send sample events to the endpoint. This does not
   create anything:

   ```sh
   export ENDPOINT="https://inbound-log-drain.<subdomain>.workers.dev/ingest"
   jq -n '{schemas:{log:{version:"v1"}},delivery:{type:"http",endpoint:env.ENDPOINT,encoding:"ndjson",compression:"none",headers:{},secret:env.DRAIN_SECRET}}' \
     | vercel api "/v1/drains/test?teamId=team_b95IUKWS36vwBZG6uVjFqbtF" -X POST --input -
   ```

8. Create the drain. Run this from the same shell, so `DRAIN_SECRET` and
   `ENDPOINT` are still exported. `jq` reads them from the environment, so the
   secret never appears in argv. Set `log.sources` to the sources you want
   drained:

   ```sh
   jq -n '{
     name: "inbound-log-drain",
     projects: "some",
     projectIds: ["prj_YXJUhloNNhnXKQZWlU7PvXYs4cya"],
     schemas: { log: { version: "v1" } },
     filter: { version: "v2", filter: { type: "basic",
       log: { sources: ["lambda", "edge", "static"] },
       deployment: { environments: ["production"] } } },
     delivery: { type: "http", endpoint: env.ENDPOINT, encoding: "ndjson",
       compression: "none", headers: {}, secret: env.DRAIN_SECRET },
     sampling: []
   }' | vercel api "/v1/drains?teamId=team_b95IUKWS36vwBZG6uVjFqbtF" -X POST --input - --raw \
     | jq 'del(.delivery.secret, .delivery.headers)'
   unset DRAIN_SECRET
   ```

   If Vercel asks for endpoint verification, run
   `bunx wrangler secret put VERCEL_VERIFY_TOKEN --env=""` with the code it shows, then
   retry.

9. Run the smoke test against the deployed Worker. It writes a few records
   tagged `smoke-<timestamp>`:

   ```sh
   DRAIN_URL=https://inbound-log-drain.<subdomain>.workers.dev QUERY_DELAY_SECONDS=360 \
     VERCEL_DRAIN_SECRET=… QUERY_TOKEN=… bun run smoke
   ```

   In pipeline mode, records show up in queries after the sink's roll
   interval, which is about 5 minutes. `QUERY_DELAY_SECONDS` covers that wait.

10. Leave the drain running for a few days next to Observability Plus, then
    turn Observability Plus off in Vercel.

## Limits and ways to cut volume

- **Vercel sampling rules** (`sampling: [{ type: "head_sampling", rate, env, requestPath }]`):
  - Up to 10 rules, applied top to bottom.
  - Once any rule exists, requests that match no rule are dropped. Always end
    with a catch-all rule, for example `{ type: "head_sampling", rate: 1 }`.
  - Example: `{rate: 0.1, requestPath: "/_next/"}` followed by `{rate: 1}`.
- **Vercel filters**:
  - Leave out `static` and `build` from `log.sources`. Static asset requests
    are usually a large share of events.
  - Or use an OData filter:
    `filter: { version: "v2", filter: { type: "odata", text: "log/source ne 'static' or log/statusCode ge 400" } }`.
- **Search is a scan**:
  - There is no index. Queries are fast for windows of hours. For days, page
    with `nextCursor`.
  - A `requestId` lookup without a time range scans the last hour by default.
    Pass `from`/`to` around the time you expect.
  - The R2 SQL/Iceberg runner-up would make long-range search cheap once its
    retention gap is solved.
- **Data is a few minutes behind** in pipeline mode, because of the sink's
  roll interval (default 300 s, minimum 10 s). Lowering it means more and
  smaller files: more Class A writes and slower scans.
- **Late arrivals.** Partitions follow write time, not record time. Queries
  also scan `INGEST_LAG_MINUTES` (60) past `to`, so records delayed by retry
  bursts or a pipeline backlog are still found. A delay longer than that
  hides the record from time-window queries.
- **R2-direct mode** (no `LOG_STREAM`) writes one object per delivery. At
  production delivery rates that is thousands of objects an hour, so queries
  hit `MAX_SCAN_OBJECTS` and return `truncated`. Use it for local work or
  low volume only.
- **Deliveries are not de-duplicated.** If Vercel retries a delivery, the
  records can be stored twice. Metrics de-duplicate by `requestId` only within
  one delivery (Analytics Engine) or one scan window (`engine=scan`).
- **Records that do not match `pipeline/schema.json` are accepted by
  Pipelines but dropped later.** The test `pipeline schema covers every
  field…` keeps the schema and the normalizer in sync. Stream schemas cannot
  change after creation; to add a field, create a new stream.
- **Analytics Engine** takes at most 250 points per invocation. Bigger batches
  are sampled uniformly, and the weight is kept in `double4`.
