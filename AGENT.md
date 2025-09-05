# AGENT.md - Development Guide for Inbound Email System

## Build/Test Commands
- `bun run dev` - Start Next.js dev server (turbopack enabled) **requires approval**
- `bun run build` - Build Next.js app (turbopack enabled) **requires approval**  
- `bun run lint` - Run Next.js linting
- `bun run test-api` - Run API tests (`bun run app/api/v2/api.test.ts`)
- `bun run test-sdk` - Run SDK tests (`bun run app/api/v2/sdk.test.ts`)
- Single test: `bun test app/api/v2/testing.test.ts` (use bun test for individual files)
- `bun run inbound-webhook-test` - Comprehensive SES email webhook simulator with templates
- `bun run inbound-webhook` - Simple webhook tester with customizable sender/recipient

## Architecture & Structure
- **Next.js 15** app with turbopack, AWS infrastructure (SES, Lambda, S3, CDK)
- **Database**: Drizzle ORM with schema in `lib/db/schema.ts`, uses `structuredEmails` (NOT deprecated `receivedEmails`/`parsedEmails`) do not write raw sql queries, always use the ORM.
- **Key Modules**: `lib/email-management/` (routing, parsing), `features/` (domain logic), `app/api/v2/` (REST API)
- **AWS**: CDK stack in `aws/cdk/`, Lambda processors in `lambda/`, deployment scripts in `scripts/`
- **Frontend**: React 19, TanStack Query, Radix UI, Tailwind CSS, Framer Motion

## Code Style & Conventions
- **Package Manager**: Only use `bun` (never npm/yarn)
- **Types**: Find existing types in schemas, don't create duplicates
- **Imports**: Use `@/` path alias, group external → local → types
- **Error Handling**: try/catch with proper propagation, React Query patterns for client errors
- **Async/Await**: Prefer async/await over .then() chains
- **Icons**: Use Nucleo icons via MCP
- **API**: Create new functions/components in `app/api/` folder following OpenAPI spec & the v2-api spec
- **No Comments**: Don't add code comments unless explicitly requested
- **Don't Create useless readme files**: If a file is self-explanatory, don't create a readme file for it
- **Never run bunx dizzle-kit generate/push** - I will manually do that just prompt me to do so.

## Recent Changes
- **VIP System Security Fixes Applied** - Critical security vulnerabilities have been fixed in the VIP payment system
- **Database Schema Updated** - Added unique constraints and indexes for VIP tables (requires migration) 

## Application and Business Logic
- **Website & Docs** - the official website is inbound.new, the API is inbound.new/api/v2, and the docs are at docs.inbound.new
