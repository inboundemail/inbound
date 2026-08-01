---
name: inboundctl
description: Use inboundctl to inspect, triage, read, validate, send, and reply to email through named Inbound mailbox scopes.
---

# inboundctl

Use `inboundctl` for Inbound email workflows. Prefer `--json` whenever command output will be parsed.

## Authentication

1. Check authentication with `inboundctl auth status --json`.
2. If authentication is missing, ask the user to run `inboundctl login` and approve the browser device flow.
3. Never ask the user to paste an API key into chat.

## Mailbox Scope

1. Inspect available scopes with `inboundctl mailbox list --json`.
2. Use `-m <name>` when the user identifies a mailbox.
3. A selector such as `*@example.com` includes every recipient at that domain.
4. Do not broaden mailbox scope without telling the user.

## Inbox Workflow

```bash
inboundctl -m support --unread --json
inboundctl email get <email-id> --json
inboundctl email mark <email-id> --read --json
inboundctl thread list -m support --json
inboundctl thread get <thread-id> --json
```

## Sending

1. Sending and replying require explicit user intent.
2. Validate or dry-run a message before sending it.
3. Confirm the resolved sender, recipients, subject, and mailbox scope.
4. Do not retry a send after an ambiguous network failure without checking whether it was accepted.

```bash
inboundctl validate message.inbound --json
inboundctl send message.inbound -m support --dry-run --json
inboundctl send message.inbound -m support --json
inboundctl reply <email-id> -m support --text-file reply.txt --dry-run --json
```

Treat validation errors as blocking. Explain warnings before using `--strict` or proceeding with a send.
