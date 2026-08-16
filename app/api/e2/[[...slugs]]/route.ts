import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { createBlockedSignupDomain } from "../admin/blocked-signup-domains/create";
import { deleteBlockedSignupDomain } from "../admin/blocked-signup-domains/delete";
import { getBlockedSignupDomain } from "../admin/blocked-signup-domains/get";
import { listBlockedSignupDomains } from "../admin/blocked-signup-domains/list";
import { updateBlockedSignupDomain } from "../admin/blocked-signup-domains/update";
import { deleteIdentity } from "../admin/identities/delete";
import { listTenants } from "../admin/tenants/list";
import { pauseTenant } from "../admin/tenants/pause";
import { suspendTenant } from "../admin/tenants/suspend";
import { banUser } from "../admin/users/ban";
import { unbanUser } from "../admin/users/unban";
import { getAttachment } from "../attachments/get";
import { revokeCurrentApiKey } from "../auth/revoke-key";
import { createDomain } from "../domains/create";
import { deleteDomain } from "../domains/delete";
import { getDomain } from "../domains/get";
import { listDomains } from "../domains/list";
import { updateDomain } from "../domains/update";
import { createEmailAddress } from "../email-addresses/create";
import { deleteEmailAddress } from "../email-addresses/delete";
import { getEmailAddress } from "../email-addresses/get";
import { listEmailAddresses } from "../email-addresses/list";
import { updateEmailAddress } from "../email-addresses/update";
import { cancelEmailBatch } from "../emails/batch-cancel";
import { createEmailBatch } from "../emails/batch-create";
import { getEmailBatch } from "../emails/batch-get";
import { retryEmailBatch } from "../emails/batch-retry";
import { cancelEmail } from "../emails/cancel";
import { getEmail } from "../emails/get";
import { listEmails } from "../emails/list";
import { replyToEmail } from "../emails/reply";
import { retryEmail } from "../emails/retry";
import { sendEmail } from "../emails/send";
import { updateEmail } from "../emails/update";
import { createEndpoint } from "../endpoints/create";
import { deleteEndpoint } from "../endpoints/delete";
import { getEndpoint } from "../endpoints/get";
import { listEndpoints } from "../endpoints/list";
import { testEndpoint } from "../endpoints/test";
import { updateEndpoint } from "../endpoints/update";
import { checkGuardRule } from "../guard/check";
import { createGuardRule } from "../guard/create";
import { deleteGuardRule } from "../guard/delete";
import { generateGuardRules } from "../guard/generate";
import { getGuardRule } from "../guard/get";
// Guard routes
import { listGuardRules } from "../guard/list";
import { updateGuardRule } from "../guard/update";
import { AuthError } from "../lib/auth";
import { getThread } from "../mail/threads-get";
// Inbox routes (threaded conversations)
import { listThreads } from "../mail/threads-list";
import { authenticateMailbox } from "../mailboxes/authenticate";
import { authenticateSmtp } from "../mailboxes/authenticate-smtp";
import { createMailbox } from "../mailboxes/create";
import { deleteMailbox } from "../mailboxes/delete";
import { listMailboxes } from "../mailboxes/list";
import { rotateMailboxPassword } from "../mailboxes/rotate-password";
import { updateMailbox } from "../mailboxes/update";
import { checkOnboardingReply } from "../onboarding/check-reply";
// Onboarding routes
import { sendOnboardingDemo } from "../onboarding/demo";

// Webhook documentation content (rendered as a documentation page)
const webhookStructureDoc = `
When emails arrive at your configured addresses, Inbound sends a webhook to your endpoint with the complete email data.

## Webhook Payload Structure

We provide a fully typed webhook payload for you to use in your endpoints:

\`\`\`typescript
import type { InboundWebhookPayload } from 'inboundemail'
\`\`\`

### Example Payload

\`\`\`typescript
const payload: InboundWebhookPayload = {
  event: 'email.received',
  timestamp: '2024-01-15T10:30:00Z',
  email: {
    id: 'inbnd_abc123def456ghi',
    messageId: '<unique-id@sender.com>',
    from: {
      text: 'John Doe <john@sender.com>',
      addresses: [{
        name: 'John Doe',
        address: 'john@sender.com'
      }]
    },
    to: {
      text: 'support@yourdomain.com',
      addresses: [{
        name: null,
        address: 'support@yourdomain.com'
      }]
    },
    recipient: 'support@yourdomain.com',
    subject: 'Help with my order',
    receivedAt: '2024-01-15T10:30:00Z',
    parsedData: {
      messageId: '<unique-id@sender.com>',
      date: new Date('2024-01-15T10:30:00Z'),
      subject: 'Help with my order',
      from: { /* ... */ },
      to: { /* ... */ },
      cc: null,
      bcc: null,
      replyTo: null,
      textBody: 'Hello, I need help with my recent order...',
      htmlBody: '<p>Hello, I need help with my recent order...</p>',
      attachments: [
        {
          filename: 'order-receipt.pdf',
          contentType: 'application/pdf',
          size: 45678,
          contentId: '<att_abc123>',
          contentDisposition: 'attachment',
          downloadUrl: 'https://inbound.new/api/e2/attachments/inbnd_abc123/order-receipt.pdf'
        }
      ]
    }
  },
  endpoint: {
    id: 'endp_xyz789',
    name: 'Support Webhook',
    type: 'webhook'
  }
}
\`\`\`

## Webhook Security

Always verify webhook requests before processing them to prevent unauthorized access.

### Verification Headers

Every webhook request includes security headers:

| Header | Description |
|--------|-------------|
| \`X-Webhook-Verification-Token\` | Unique verification token for your endpoint |
| \`X-Endpoint-ID\` | ID of the endpoint that triggered this webhook |
| \`X-Webhook-Event\` | Event type (e.g., \`email.received\`) |
| \`X-Webhook-Timestamp\` | ISO 8601 timestamp of when the webhook was sent |

### Verifying with the SDK

\`\`\`typescript
import { Inbound, verifyWebhookFromHeaders } from 'inboundemail'

const inbound = new Inbound(process.env.INBOUND_API_KEY!)

export async function POST(request: Request) {
  // Verify webhook authenticity before processing
  const isValid = await verifyWebhookFromHeaders(request.headers, inbound)
  
  if (!isValid) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  // Process the verified webhook payload
  const payload: InboundWebhookPayload = await request.json()
  const { email } = payload
  
  console.log('Received verified email:', email.subject)
  
  return new Response('OK', { status: 200 })
}
\`\`\`

## Downloading Attachments

Each attachment includes a \`downloadUrl\` for direct file access:

\`\`\`typescript
// Download attachments from webhook payload
for (const attachment of email.parsedData.attachments) {
  const response = await fetch(attachment.downloadUrl, {
    headers: {
      'Authorization': \`Bearer \${process.env.INBOUND_API_KEY}\`
    }
  })
  
  if (response.ok) {
    const fileBuffer = await response.arrayBuffer()
    // Process the file...
  }
}
\`\`\`

> **Note:** Authentication via API key in the Authorization header is required to download attachments.
`;

const app = new Elysia({ prefix: "/api/e2" })
	.use(
		openapi({
			exclude: {
				tags: ["Admin"],
			},
			documentation: {
				openapi: "3.1.0",
				servers: [
					{
						url: "https://inbound.new",
						description: "Production API server",
					},
				],
				info: {
					title: "Inbound Email API",
					version: "2.0.0",
					description: `
# Inbound API

The Inbound API allows you to manage email infrastructure programmatically - domains, email addresses, webhooks, and more.

## Authentication

All API requests require a Bearer token in the Authorization header:

\`\`\`bash
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  https://inbound.new/api/e2/domains
\`\`\`

## Base URL

\`\`\`
https://inbound.new/api/e2
\`\`\`

## Quick Start

1. **Create a domain** - Register your domain with Inbound
2. **Configure DNS** - Add the provided DNS records to your domain
3. **Create an email address** - Set up addresses to receive emails
4. **Create an endpoint** - Configure where emails are delivered (webhook, forwarding, etc.)

`,
				},
				webhooks: {
					emailReceived: {
						post: {
							summary: "Email Received",
							description: webhookStructureDoc,
							tags: ["Webhooks"],
							requestBody: {
								description: "Webhook payload sent when an email is received",
								content: {
									"application/json": {
										schema: {
											type: "object",
											properties: {
												event: {
													type: "string",
													example: "email.received",
													description: "The event type",
												},
												timestamp: {
													type: "string",
													format: "date-time",
													example: "2024-01-15T10:30:00Z",
												},
												email: {
													type: "object",
													properties: {
														id: {
															type: "string",
															example: "inbnd_abc123def456ghi",
														},
														messageId: {
															type: "string",
															example: "<unique-id@sender.com>",
														},
														subject: {
															type: "string",
															example: "Help with my order",
														},
														recipient: {
															type: "string",
															example: "support@yourdomain.com",
														},
														from: {
															type: "object",
															properties: {
																text: { type: "string" },
																addresses: {
																	type: "array",
																	items: {
																		type: "object",
																		properties: {
																			name: { type: ["string", "null"] },
																			address: { type: "string" },
																		},
																	},
																},
															},
														},
														to: {
															type: "object",
															properties: {
																text: { type: "string" },
																addresses: {
																	type: "array",
																	items: {
																		type: "object",
																		properties: {
																			name: { type: ["string", "null"] },
																			address: { type: "string" },
																		},
																	},
																},
															},
														},
														parsedData: {
															type: "object",
															properties: {
																textBody: { type: ["string", "null"] },
																htmlBody: { type: ["string", "null"] },
																attachments: {
																	type: "array",
																	items: {
																		type: "object",
																		properties: {
																			filename: { type: "string" },
																			contentType: { type: "string" },
																			size: { type: "integer" },
																			downloadUrl: { type: "string" },
																		},
																	},
																},
															},
														},
													},
												},
												endpoint: {
													type: "object",
													properties: {
														id: { type: "string", example: "endp_xyz789" },
														name: {
															type: "string",
															example: "Support Webhook",
														},
														type: { type: "string", example: "webhook" },
													},
												},
											},
										},
									},
								},
							},
							responses: {
								"200": {
									description: "Webhook processed successfully",
								},
							},
						},
					},
				},
				tags: [
					{
						name: "Webhooks",
						description:
							"Webhooks sent by Inbound to your configured endpoints when events occur.",
					},
					{
						name: "Emails",
						description:
							"Send, list, and manage emails. Supports immediate sending, scheduling, replies, and retry functionality.",
					},
					{
						name: "Mail",
						description:
							"Inbox and thread views for received emails. Filter by domain, address, or search.",
					},
					{
						name: "Domains",
						description:
							"Manage domains for sending and receiving emails. Domains must be verified via DNS before use.",
					},
					{
						name: "Endpoints",
						description:
							"Configure where incoming emails are delivered - webhooks, email forwarding, or custom handlers.",
					},
					{
						name: "Email Addresses",
						description:
							"Create and manage email addresses on your verified domains.",
					},
					{
						name: "Attachments",
						description:
							"Download email attachments using authenticated requests.",
					},
				],
				components: {
					securitySchemes: {
						bearerAuth: {
							type: "http",
							scheme: "bearer",
							bearerFormat: "API Key",
							description:
								"Your Inbound API key. Include it in the Authorization header as: Bearer <your-api-key>",
						},
					},
				},
				security: [
					{
						bearerAuth: [],
					},
				],
			} as Record<string, unknown>,
			path: "/docs",
			specPath: "/openapi.json",
		}),
	)
	// Global error handler for RFC-compliant error responses
	.onError(({ code, error, set }) => {
		console.log("🔥 Error handler triggered:", {
			code,
			error: error instanceof Error ? error.message : "Unknown error",
		});

		// Handle AuthError with RFC-compliant formatting
		if (error instanceof AuthError) {
			// Headers are already set by validateAndRateLimit
			return error.response;
		}

		// Handle other Elysia errors
		if (code === "VALIDATION") {
			set.status = 400;
			return {
				error: "Bad Request",
				message: "Validation failed. Check your request parameters.",
				statusCode: 400,
			};
		}

		if (code === "NOT_FOUND") {
			set.status = 404;
			return {
				error: "Not Found",
				message: "The requested resource was not found.",
				statusCode: 404,
				deprecation_notice:
					"The /api/v2 routes and @inboundemail/sdk package are deprecated due to security concerns. Please migrate to the official 'inboundemail' package and use /api/e2 routes. See https://inbound.new/docs for documentation.",
			};
		}

		// Generic error handler
		set.status = 500;
		return {
			error: "Internal Server Error",
			message: "An unexpected error occurred.",
			statusCode: 500,
		};
	})
	// Domain routes
	.use(listDomains)
	.use(createDomain)
	.use(getDomain)
	.use(updateDomain)
	.use(deleteDomain)
	// Endpoint routes
	.use(listEndpoints)
	.use(createEndpoint)
	.use(getEndpoint)
	.use(updateEndpoint)
	.use(deleteEndpoint)
	.use(testEndpoint)
	// Email Address routes
	.use(listEmailAddresses)
	.use(getEmailAddress)
	.use(createEmailAddress)
	.use(updateEmailAddress)
	.use(deleteEmailAddress)
	// Attachment routes
	.use(getAttachment)
	.use(revokeCurrentApiKey)
	// Email routes (sending, listing, managing)
	.use(sendEmail)
	.use(listEmails)
	.use(createEmailBatch)
	.use(retryEmailBatch)
	.use(getEmailBatch)
	.use(cancelEmailBatch)
	.use(getEmail)
	.use(updateEmail)
	.use(cancelEmail)
	.use(replyToEmail)
	.use(retryEmail)
	// Inbox routes (threaded conversations)
	.use(listThreads)
	.use(getThread)
	.use(listMailboxes)
	.use(createMailbox)
	.use(updateMailbox)
	.use(deleteMailbox)
	.use(rotateMailboxPassword)
	.use(authenticateMailbox)
	.use(authenticateSmtp)
	// Onboarding routes
	.use(sendOnboardingDemo)
	.use(checkOnboardingReply)
	// Admin routes
	.use(listBlockedSignupDomains)
	.use(createBlockedSignupDomain)
	.use(getBlockedSignupDomain)
	.use(updateBlockedSignupDomain)
	.use(deleteBlockedSignupDomain)
	.use(listTenants)
	.use(pauseTenant)
	.use(suspendTenant)
	.use(banUser)
	.use(unbanUser)
	.use(deleteIdentity)
	// Guard routes
	.use(listGuardRules)
	.use(createGuardRule)
	.use(getGuardRule)
	.use(updateGuardRule)
	.use(deleteGuardRule)
	.use(checkGuardRule)
	.use(generateGuardRules);

// The /api/v2 -> /api/e2 rewrite in next.config.ts can deliver requests to
// this handler with the original /api/v2 URL intact (behavior varies by
// Vercel builder version). Normalize the path so Elysia (prefixed /api/e2)
// matches regardless of which URL the platform passes through.
const handler = (request: Request): Promise<Response> => {
	const url = new URL(request.url);

	if (url.pathname === "/api/v2" || url.pathname.startsWith("/api/v2/")) {
		url.pathname = `/api/e2${url.pathname.slice("/api/v2".length)}`;

		return app.fetch(
			new Request(url, {
				method: request.method,
				headers: request.headers,
				body: request.body,
				duplex: "half",
			} as RequestInit),
		);
	}

	return app.fetch(request);
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;

export type App = typeof app;

// Export app instance for OpenAPI generation script
export { app };
