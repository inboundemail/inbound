# Changelog

## 0.21.0

The in-house OpenAPI generator replaces Stainless and covers all 87 current E2 operations, including mailboxes, folders and their messages, filters, spam, access controls, activity, guard, onboarding and auth.

### Compatibility with the published 0.20.0 SDK

- **Kept:** all 25 methods, named/default client, CJS call or `new`, runtime resource constructors (`Inbound.Domains`, etc.), all 64 original import paths across extensionless/`.js`/`.mjs` variants, classic Node type resolution, `withOptions`, raw HTTP verb methods and `request`. `mail` still accesses threads; `threads` aliases it. React rendering still loads `@react-email/render` on demand.
- All 17 published payload input interfaces, `ClientOptions` and `RequestOptions` remain assignable with `exactOptionalPropertyTypes: true`. Generated payloads are structural type aliases, not declaration-mergeable Stainless interfaces. Richer responses describe the current API, so handwritten mock responses may need the newly required domain fields.
- The old filename-first attachment overload remains `APIPromise<void>`; only the new `(id, filename)` overload is typed `APIPromise<Response>`. Both deliver the same wire response at runtime. Send/reply always return an `APIPromise` (still awaitable), including React bodies.
- **Replay safety:** GET/HEAD/OPTIONS/PUT/DELETE can retry network errors, per-attempt timeouts, 408/409/429 and 5xx. Only generated `emails.send` and `emails.reply` can replay a POST, and only with an effective `Idempotency-Key`. PATCH and non-repeatable streams are not replayed. Eligible requests honor retry hints up to 60 seconds per wait; defaults are two retries and 60 seconds per attempt.
- **Environment and wire defaults:** process env fallbacks (`INBOUND_API_KEY`, `INBOUND_BASE_URL`) are supported, not a separate `Deno.env` fallback. Both environment values are trimmed. `INBOUND_BASE_URL` is consulted only when `baseURL` is omitted or undefined; explicit `null` or `''` selects `https://inbound.new`. No SDK-supplied legacy `Accept`, User-Agent or Stainless identification/retry headers (fetch may set its own). Null/undefined query values are omitted rather than sending a null query as `key=`.

**Intentionally dropped internals:** `buildURL`, `buildRequest`, `fetchWithTimeout`, `prepareOptions`, `prepareRequest`, `authHeaders` and other Stainless subclass hooks, and `APIPromise._thenUnwrap`. Generated resource calls own their method/path/body; use `request({method, path, body})` or the raw verb methods when overriding the wire request.

See [PR #231’s compatibility tables](https://github.com/inboundemail/inbound/pull/231) for the method and payload changes.
