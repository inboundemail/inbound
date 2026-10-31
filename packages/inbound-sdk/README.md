# Inbound TypeScript SDK

`bun add inboundemail` (Node 18+, Bun, or an edge runtime with `fetch`).

```ts
import Inbound from "inboundemail";

const client = new Inbound(); // reads INBOUND_API_KEY; pass { apiKey } on edge
```

Omitting `baseURL` uses `INBOUND_BASE_URL` if set. Pass `baseURL: null` to use `https://inbound.new` regardless of the environment.

**Send an email.** Use the same key when retrying the same logical send.

```ts
const sent = await client.emails.send({
  from: "hello@example.com",
  to: "reader@example.org",
  subject: "Your receipt",
  text: "Thanks for your order.",
  idempotencyKey: "receipt-order-42",
});
console.log(sent.id);
```

**List emails.** Use `list` to fetch one page or `listAll` to fetch subsequent pages on demand.

```ts
for await (const email of client.emails.listAll({ type: "received", limit: 50 })) {
  console.log(email.id);
}
```

**List a mailbox’s folders.** Mailbox, folder, and message identifiers are positional, in URL order. Pass unencoded values.

```ts
const { data: mailboxes } = await client.mailboxes.list({ limit: 1 });
if (mailboxes.length) {
  const { data: folders } = await client.folders.list(mailboxes[0].id);
  console.log(folders.map(folder => folder.path));
}
```

`timeout` limits each fetch attempt in milliseconds (default 60,000). GET, HEAD, OPTIONS, PUT and DELETE retry connection failures, timeouts, 408, 409, 429 and 5xx up to `maxRetries` times (default 2). Only generated `emails.send` and `emails.reply` can retry a POST, and only with an `Idempotency-Key`: those routes enforce it on the server. Other POSTs, including raw requests, are never replayed. The client honors `x-should-retry` and waits for `Retry-After` (seconds or HTTP-date) or `retry-after-ms`, capped at 60 seconds. HTTP errors are `InboundError` instances with `status`, `code` (when supplied by the API) and `body`.

Attachment downloads and raw messages return a standard `Response`: call `.arrayBuffer()` for bytes. Use `attachments.retrieve(id, filename)` for a typed response; the legacy `attachments.retrieve(filename, { id })` overload keeps its `void` result type. `mail.list/retrieve` still access account threads; `threads` is an alias. For incremental folder sync (`sinceUid` or `sinceModseq`), use `folderMessages.list()`, not the offset-based `listAll()`.

`@react-email/render` is installed with the SDK and loaded only when using `render()` or a `react` email body.

## Releasing

Once, as an `inboundemail` maintainer, open the package’s **Settings → Trusted Publisher** on npmjs.com. Select **GitHub Actions**, enter owner `inboundemail`, repository `inbound`, workflow filename `publish-sdk.yml`, leave the environment blank, and save. No npm secret is needed. Alternatively, set the GitHub Actions repository secret `NPM_TOKEN` to an npm granular access token with publish access for `inboundemail` and bypass 2FA enabled; the workflow passes it as `NODE_AUTH_TOKEN`.

Preview with `bun run sdk:release -- <version> --dry-run`. From a clean `main`, replace `--dry-run` with `--apply` to prepare a local commit and annotated tag; optionally add `--notes "release notes"`. Review before running the printed push command: pushing the tag publishes to `latest`. Manual workflow runs default to dry-run; a real manual publish requires the matching Git tag as its ref and accepts a custom npm dist-tag.
