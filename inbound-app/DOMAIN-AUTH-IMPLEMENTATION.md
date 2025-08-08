## SES domain authentication: DKIM, SPF, DMARC — implementation plan

### Current state (in repo)
- `lib/domains-and-dns/domain-verification.ts`: starts SES domain verification via `VerifyDomainIdentity` and proposes TXT `_amazonses.{domain}`. Also adds an MX record for inbound processing.
- `lib/domains-and-dns/dns.ts`: verification supports `TXT` and `MX` (with fallback resolvers). Does not yet verify `CNAME` records (required for DKIM Easy DKIM tokens).
- `app/api/v2/domains/[id]/dns-records/route.ts`: returns stored DNS records from `domainDnsRecords`.

Gaps: No DKIM CNAME generation/verification, no custom MAIL FROM setup/signaling for SPF alignment, no DMARC recommendation/verification.

### What we want to deliver to users (DNS records we generate and verify)
- Ownership (SES identity):
  - TXT: `_amazonses.{domain}` = `{ses_verification_token}`
- DKIM (Easy DKIM):
  - 3× CNAME: `{tokenN}._domainkey.{domain}` → `{tokenN}.dkim.amazonses.com`
- Custom MAIL FROM (SPF alignment for bounce/return-path):
  - Choose `mail.{domain}` (configurable)
  - MX: `mail.{domain}` = `10 feedback-smtp.{aws-region}.amazonses.com`
  - TXT (recommended): `mail.{domain}` = `v=spf1 include:amazonses.com -all`
- Root SPF (recommended if not using only custom MAIL FROM):
  - TXT: `{domain}` = `v=spf1 include:amazonses.com ~all`
- DMARC (start relaxed, move to quarantine/reject later):
  - TXT: `_dmarc.{domain}` = `v=DMARC1; p=none; rua=mailto:dmarc@{domain}; ruf=mailto:dmarc@{domain}; fo=1; aspf=r; adkim=r`

Note: If an SPF TXT already exists, we should merge includes rather than create duplicates.

### Implementation steps (minimal phases)

1) SES identity + Easy DKIM
- Add SES v2 (preferred) client alongside current v1 or continue with v1 for now.
  - v2 path:
    - Create/update identity via `CreateEmailIdentity`/`PutEmailIdentityDkimSigningAttributes` with `SigningAttributesOrigin: AWS_SES` (Easy DKIM).
    - Fetch DKIM tokens via `GetEmailIdentity` → `DkimAttributes.Tokens`.
  - v1 path (if we keep current client):
    - `VerifyDomainIdentity` (already done) and `VerifyDomainDkim` to get 3 tokens.
- Persist 3 CNAME records to `domainDnsRecords` (required=true) for `{token}._domainkey.{domain}` → `{token}.dkim.amazonses.com`.
- Persist TXT `_amazonses.{domain}` token if not present.

2) Custom MAIL FROM domain (SPF alignment)
- Choose default `mail.{domain}`; allow override.
- Configure in SES:
  - v2: `PutEmailIdentityMailFromAttributes` with `MailFromDomain: mail.{domain}` and `BehaviorOnMxFailure: USE_DEFAULT_VALUE`.
  - v1: `SetIdentityMailFromDomain`.
- Persist required DNS:
  - MX `mail.{domain}` = `10 feedback-smtp.{region}.amazonses.com` (required=true)
  - TXT `mail.{domain}` = `v=spf1 include:amazonses.com -all` (recommended)

3) SPF and DMARC helpers
- New domains: auto-generate SPF (root TXT if no SPF exists, or guidance to merge if one exists) and recommend DMARC TXT (p=none by default).
- Existing verified domains: if SPF and/or DMARC missing, surface an “Add additional records” section with one-click copy values and verification status.

4) DNS verification engine updates
- Extend `verifyDnsRecords` to support `CNAME` lookups so we can verify DKIM tokens:
  - Add `CNAME` branch that resolves CNAME and matches target value case-insensitively.
- Keep existing TXT/MX verification with fallback resolvers.
- Add simple helpers to recognize DMARC/SPF values as pass if they contain the expected directives (exact match preferred for first iteration).

5) API surface (v2)
- New endpoint: `POST /api/v2/domains/{id}/auth/init`
  - Creates/updates SES identity (and Easy DKIM), configures MAIL FROM, persists DNS records to `domainDnsRecords`, returns `records[]` including SPF/DMARC recommendations for UI.
- New endpoint: `POST /api/v2/domains/{id}/auth/verify`
  - Re-runs DNS verification (TXT/CNAME/MX) + SES status checks:
    - v2: `GetEmailIdentity` → `VerifiedForSendingStatus`, `DkimAttributes.Status`, `MailFromAttributes.MailFromDomainStatus`.
    - v1: `GetIdentityVerificationAttributes`, `GetIdentityDkimAttributes`, `GetIdentityMailFromDomainAttributes`.
  - Updates `domainDnsRecords.isVerified` and domain status to `verified` only when all required records are verified and SES reports success.
- Existing `GET /api/v2/domains/{id}/dns-records` already returns records; keep using it.

6) UI behavior in `app/(main)/emails/[id]/page.tsx`
- When `status === verified` but SPF and/or DMARC are missing, render an “Add additional records” card listing:
  - Root SPF (or MAIL FROM SPF) recommendation with copy buttons and a verify CTA
  - DMARC recommendation with copy and explainers (start with `p=none`)
- When `status === pending`, continue to show the full required list (ownership + DKIM + MAIL FROM). Include SPF/DMARC under “recommended”.

7) Do we really need DKIM?
- Yes, for best deliverability and alignment. SES Easy DKIM is the standard path and is expected by major inbox providers. While SPF+DMARC can help, DKIM is broadly required for reputable sending and to pass DMARC alignment reliably, especially as providers tighten requirements.

### Acceptance criteria
- Users are shown a complete list of DNS records for domain authentication (ownership + DKIM + MAIL FROM + SPF + DMARC).
- New domains auto-generate SPF recommendation and DMARC suggestion; existing verified domains without SPF/DMARC see an “Add additional records” section.
- Verify endpoint flips `isVerified` per record and marks domain `verified` only when all required checks pass.
- SES identity shows DKIM enabled and MAIL FROM domain in OK status.
- Safe handling of pre‑existing SPF: merge guidance, don’t duplicate.

### Notes
- Keep inbound MX records separate from sending auth records (don’t overwrite user’s existing mail flow).
- DMARC policy can evolve from `p=none` → `quarantine` → `reject` as user’s alignment stabilizes.
- Region: use `process.env.AWS_REGION` for SES region when generating record values.
