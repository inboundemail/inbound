# AGENT.md - Inbound Email System

## Build/Test Commands
- `bun run dev` - Start Next.js development server with turbopack
- `bun run build` - Build Next.js application with turbopack
- `bun run lint` - Run Next.js linting
- `bun run app/api/v1/sdk/tests/run-tests.ts` - Run all tests
- `bun run app/api/v1/sdk/tests/run-tests.ts unit` - Run unit tests only
- `bun run app/api/v1/sdk/tests/run-tests.ts integration` - Run integration tests only

## Architecture
- **Next.js 15** app with App Router (app/ directory)
- **Database**: PostgreSQL with Drizzle ORM (lib/db/schema.ts)
- **Auth**: better-auth (lib/auth.ts)
- **Email System**: AWS SES + Lambda + S3 for email processing
- **Billing**: Stripe integration with autumn-js for usage tracking
- **Styling**: Tailwind CSS with radix-ui components
- **API**: RESTful endpoints in app/api/ with OpenAPI schema

## Code Style
- **TypeScript**: Strict mode enabled, ES2017 target
- **Imports**: Use `@/` alias for root imports
- **Server Actions**: `"use server"` directive for server actions (app/actions/)
- **Database**: Drizzle ORM with schema in lib/db/schema.ts
- **Error Handling**: Return objects with `{ success: boolean, error?: string }`
- **Async/Await**: Use async/await over promises
- **Logging**: Console.log with emoji prefixes (🚀, ✅, ❌, 🔍, etc.)
- **Authentication**: Use `auth.api.getSession()` for protected routes
- **Validation**: Zod for runtime validation
- **File Structure**: Group by feature (actions, components, lib)
