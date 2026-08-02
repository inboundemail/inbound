# Inbound Mail

A fast, local-first email client for Inbound. The app is a standalone Next.js package designed to deploy as its own Vercel project at `mail.inbound.new`.

## Local development

```bash
bun install
cp env.example .env.local
bun run dev
```

Mock mode is the default. It provides a complete inbox, search, keyboard shortcuts, thread actions, drafts, and composing without credentials or network requests.

To exercise the full sign-in, domain-consent, session, and sign-out experience without OAuth credentials, set:

```bash
NEXT_PUBLIC_INBOUND_MAIL_MODE=auth-mock
INBOUND_MAIL_SESSION_SECRET=replace-with-at-least-32-random-characters
```

## Vercel

Set the Vercel Root Directory to `packages/inbound-mail`, attach `mail.inbound.new`, copy the variables from `env.example`, and change `NEXT_PUBLIC_INBOUND_MAIL_MODE` to `live`.

The OAuth callback is:

```text
https://mail.inbound.new/api/auth/callback/inbound
```

## Keyboard shortcuts

- `C` compose
- `J` / `K` next or previous thread
- `E` archive
- `S` star
- `U` mark unread
- `R` reply
- `/` search
- `⌘K` command menu
- `?` shortcut reference
