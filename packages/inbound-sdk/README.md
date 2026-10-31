# Inbound TypeScript SDK

`bun add inboundemail` (Node 18+, Bun, or an edge runtime with `fetch`).

```ts
import Inbound from "inboundemail";

const client = new Inbound(); // reads INBOUND_API_KEY; pass { apiKey } on edge
```

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

`baseURL` overrides `INBOUND_BASE_URL` (default `https://inbound.new`). `timeout` is the total request deadline in milliseconds (default 60,000). GET, HEAD, PUT, DELETE and idempotency-keyed sends/replies retry 429 and 5xx up to `maxRetries` times (default 2), respecting `Retry-After`. Other POST requests are not replayed. HTTP errors are `InboundError` instances with `status`, `code` (when supplied by the API) and `body`.

Attachment downloads and raw messages return a standard `Response`: call `.arrayBuffer()` for bytes. Both `attachments.retrieve(id, filename)` and the legacy `attachments.retrieve(filename, { id })` work. `mail.list/retrieve` still access account threads; `threads` is an alias. The SDK has no required runtime dependencies. If using the optional `react` email field or `render()` helper, install `@react-email/render` alongside the SDK.
