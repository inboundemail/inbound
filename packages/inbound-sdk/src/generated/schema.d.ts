export interface paths {
    "/api/e2/attachments/{id}/{filename}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Download email attachment
         * @description Download an email attachment by email ID and filename. Returns the binary file content with appropriate Content-Type and Content-Disposition headers.
         */
        get: operations["attachments.retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/blocklist/unblock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Unblock an email address
         * @description Remove an email address from the authenticated user's blocklist. The block must belong to one of the user's domains.
         */
        post: operations["blocklist.unblock"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/domains": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List all domains
         * @description Get paginated list of domains for authenticated user with optional filtering.
         */
        get: operations["domains.list"];
        put?: never;
        /**
         * Create new domain
         * @description Add a new domain for email receiving. Automatically initiates verification and returns required DNS records. Subdomains inherit verification from their verified parent domain.
         */
        post: operations["domains.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/domains/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get domain by ID
         * @description Get detailed information about a specific domain including DNS records. Use `?check=true` for a live verification check.
         */
        get: operations["domains.retrieve"];
        put?: never;
        post?: never;
        /**
         * Delete domain
         * @description Delete a domain and all associated resources including email addresses, DNS records, and SES configurations. Root domains with subdomains must have subdomains deleted first.
         */
        delete: operations["domains.delete"];
        options?: never;
        head?: never;
        /**
         * Update domain catch-all settings
         * @description Update catch-all email settings for a domain. Catch-all receives emails sent to any address on your domain. Domain must be verified first.
         */
        patch: operations["domains.update"];
        trace?: never;
    };
    "/api/e2/email-addresses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List all email addresses
         * @description Get paginated list of email addresses for authenticated user with optional filtering by domain, active status, and receipt rule configuration
         */
        get: operations["emailAddresses.list"];
        put?: never;
        /**
         * Create email address
         * @description Create a new email address for an authenticated user's domain, optionally routing to a webhook or endpoint.
         */
        post: operations["emailAddresses.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/email-addresses/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get email address
         * @description Get a specific email address by ID with detailed information including routing configuration
         */
        get: operations["emailAddresses.retrieve"];
        /**
         * Update email address
         * @description Update an email address's routing (endpoint/webhook) or active status. Cannot have both endpoint and webhook.
         */
        put: operations["emailAddresses.update"];
        post?: never;
        /**
         * Delete email address
         * @description Delete an email address. Returns cleanup status.
         */
        delete: operations["emailAddresses.delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/emails": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List all emails
         * @description List all email activity (sent, received, and scheduled) with comprehensive filtering options.
         */
        get: operations["emails.list"];
        put?: never;
        /**
         * Send an email
         * @description Send an email immediately or schedule it for later using the scheduled_at parameter. Supports HTML/text content, attachments, and custom headers.
         */
        post: operations["emails.send"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/emails/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get email by ID
         * @description Retrieve a single email by ID. Works for sent, received, and scheduled emails.
         */
        get: operations["emails.retrieve"];
        put?: never;
        post?: never;
        /**
         * Cancel scheduled email
         * @description Cancel a scheduled email by ID. Only works for emails that haven't been sent yet.
         */
        delete: operations["emails.cancel"];
        options?: never;
        head?: never;
        /**
         * Update email
         * @description Update metadata for a received email. Supports marking emails as read/unread and archived/unarchived.
         */
        patch: operations["emails.update"];
        trace?: never;
    };
    "/api/e2/emails/{id}/reply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reply to an email
         * @description Reply to an email or thread. Accepts either an email ID or thread ID (replies to latest message in thread). Supports reply all functionality.
         */
        post: operations["emails.reply"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/emails/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Retry email delivery
         * @description Retry delivery of a received email. Can retry to a specific endpoint, retry a specific failed delivery, or retry to all configured endpoints.
         */
        post: operations["emails.retry"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/endpoints": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List all endpoints
         * @description Get paginated list of endpoints for authenticated user with optional filtering by type, active status, sort order, and search by name
         */
        get: operations["endpoints.list"];
        put?: never;
        /**
         * Create new endpoint
         * @description Create a new endpoint (webhook, email, or email_group) for the authenticated user
         */
        post: operations["endpoints.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/endpoints/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get endpoint details
         * @description Get detailed information about a specific endpoint including delivery stats, recent deliveries, associated emails, and catch-all domains
         */
        get: operations["endpoints.retrieve"];
        /**
         * Update endpoint
         * @description Update an existing endpoint's name, description, active status, config, or webhook format
         */
        put: operations["endpoints.update"];
        post?: never;
        /**
         * Delete endpoint
         * @description Delete an endpoint and clean up associated resources (email addresses become store-only, domains lose catch-all config, group entries and delivery history are deleted)
         */
        delete: operations["endpoints.delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/endpoints/{id}/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Test endpoint
         * @description Test an endpoint by sending a test payload. For webhooks, supports inbound, discord, and slack formats. For email endpoints, simulates the forwarding process.
         */
        post: operations["endpoints.test"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/guard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List guard rules
         * @description Get all guard rules for the authenticated user with optional filtering and pagination.
         */
        get: operations["guard.list"];
        put?: never;
        /**
         * Create guard rule
         * @description Create an active email filtering rule for the authenticated account.
         *
         *     For an `explicit` rule, configure one or more of `subject`, `from`, `to`, `hasAttachment`, and `hasWords`. Different configured criteria are combined with AND. Within a criterion, `OR` matches any value and `AND` requires every value.
         *
         *     Address criteria support exact, case-insensitive addresses and whole-domain patterns such as `*@example.com`. The `to` criterion matches the actual delivered recipient, which makes it suitable for limiting a rule to one inbox. Subject and body criteria use case-insensitive substring matching.
         *
         *     Rules are evaluated from highest priority to lowest, and the first matching rule wins. A matching rule can `allow`, `block`, or `route` the email to an active endpoint owned by the account. If action is omitted, it defaults to `allow`.
         *
         *     For an `ai_prompt` rule, provide a non-empty natural-language `prompt` describing when the rule should match.
         */
        post: operations["guard.create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/guard/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get guard rule
         * @description Get a specific guard rule by ID.
         */
        get: operations["guard.retrieve"];
        /**
         * Update guard rule
         * @description Update an existing guard rule.
         */
        put: operations["guard.update"];
        post?: never;
        /**
         * Delete guard rule
         * @description Delete a guard rule by ID.
         */
        delete: operations["guard.delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/guard/{id}/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Check if rule matches email
         * @description Test a guard rule against a specific email to see if it would match.
         */
        post: operations["guard.check"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/guard/generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Generate rule from natural language
         * @description Use AI to convert a natural language description into an explicit guard rule configuration.
         */
        post: operations["guard.generate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/mail/threads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List inbox threads
         * @description List email threads (conversations) for your inbox with cursor-based pagination. This is the primary endpoint for building an inbox UI.
         *
         *     **What is a Thread?**
         *     A thread groups related emails together based on the In-Reply-To and References headers, similar to how Gmail groups conversations. Each thread contains both inbound (received) and outbound (sent) messages.
         *
         *     **Use with /mail/threads/:id:**
         *     Use this endpoint to list threads, then use `GET /mail/threads/:id` to fetch all messages in a specific thread.
         */
        get: operations["mail.list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/mail/threads/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get thread by ID
         * @description Retrieve a complete email thread (conversation) with all messages.
         *
         *     **What You Get:**
         *     - Thread metadata (subject, participants, timestamps)
         *     - All messages in the thread (both inbound and outbound)
         *     - Messages sorted chronologically by thread position
         *
         *     **Message Types:**
         *     - `inbound` - Emails you received
         *     - `outbound` - Emails you sent (includes delivery status)
         */
        get: operations["mail.retrieve"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/onboarding/check-reply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Check for onboarding demo reply
         * @description Check if the user has replied to their onboarding demo email. Used during onboarding to detect reply.
         */
        get: operations["onboarding.checkReply"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/e2/onboarding/demo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send onboarding demo email
         * @description Send a demo email during onboarding to verify email setup. User must reply to complete onboarding.
         */
        post: operations["onboarding.sendDemo"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface webhooks {
    emailReceived: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Email Received
         * @description When emails arrive at your configured addresses, Inbound sends a webhook to your endpoint with the complete email data.
         *
         *     ## Webhook Payload Structure
         *
         *     We provide a fully typed webhook payload for you to use in your endpoints:
         *
         *     ```typescript
         *     import type { InboundWebhookPayload } from 'inboundemail'
         *     ```
         *
         *     ### Example Payload
         *
         *     ```typescript
         *     const payload: InboundWebhookPayload = {
         *       event: 'email.received',
         *       timestamp: '2024-01-15T10:30:00Z',
         *       email: {
         *         id: 'inbnd_abc123def456ghi',
         *         messageId: '<unique-id@sender.com>',
         *         from: {
         *           text: 'John Doe <john@sender.com>',
         *           addresses: [{
         *             name: 'John Doe',
         *             address: 'john@sender.com'
         *           }]
         *         },
         *         to: {
         *           text: 'support@yourdomain.com',
         *           addresses: [{
         *             name: null,
         *             address: 'support@yourdomain.com'
         *           }]
         *         },
         *         recipient: 'support@yourdomain.com',
         *         subject: 'Help with my order',
         *         receivedAt: '2024-01-15T10:30:00Z',
         *         parsedData: {
         *           messageId: '<unique-id@sender.com>',
         *           date: new Date('2024-01-15T10:30:00Z'),
         *           subject: 'Help with my order',
         *           from: { /* ... *\/ },
         *           to: { /* ... *\/ },
         *           cc: null,
         *           bcc: null,
         *           replyTo: null,
         *           textBody: 'Hello, I need help with my recent order...',
         *           htmlBody: '<p>Hello, I need help with my recent order...</p>',
         *           attachments: [
         *             {
         *               filename: 'order-receipt.pdf',
         *               contentType: 'application/pdf',
         *               size: 45678,
         *               contentId: '<att_abc123>',
         *               contentDisposition: 'attachment',
         *               downloadUrl: 'https://inbound.new/api/e2/attachments/inbnd_abc123/order-receipt.pdf'
         *             }
         *           ]
         *         }
         *       },
         *       endpoint: {
         *         id: 'endp_xyz789',
         *         name: 'Support Webhook',
         *         type: 'webhook'
         *       }
         *     }
         *     ```
         *
         *     ## Webhook Security
         *
         *     Always verify webhook requests before processing them to prevent unauthorized access.
         *
         *     ### Verification Headers
         *
         *     Every webhook request includes security headers:
         *
         *     | Header | Description |
         *     |--------|-------------|
         *     | `X-Webhook-Verification-Token` | Unique verification token for your endpoint |
         *     | `X-Endpoint-ID` | ID of the endpoint that triggered this webhook |
         *     | `X-Webhook-Event` | Event type (e.g., `email.received`) |
         *     | `X-Webhook-Timestamp` | ISO 8601 timestamp of when the webhook was sent |
         *
         *     ### Verifying with the SDK
         *
         *     ```typescript
         *     import { Inbound, verifyWebhookFromHeaders } from 'inboundemail'
         *
         *     const inbound = new Inbound(process.env.INBOUND_API_KEY!)
         *
         *     export async function POST(request: Request) {
         *       // Verify webhook authenticity before processing
         *       const isValid = await verifyWebhookFromHeaders(request.headers, inbound)
         *
         *       if (!isValid) {
         *         return new Response('Unauthorized', { status: 401 })
         *       }
         *
         *       // Process the verified webhook payload
         *       const payload: InboundWebhookPayload = await request.json()
         *       const { email } = payload
         *
         *       console.log('Received verified email:', email.subject)
         *
         *       return new Response('OK', { status: 200 })
         *     }
         *     ```
         *
         *     ## Downloading Attachments
         *
         *     Each attachment includes a `downloadUrl` for direct file access:
         *
         *     ```typescript
         *     // Download attachments from webhook payload
         *     for (const attachment of email.parsedData.attachments) {
         *       const response = await fetch(attachment.downloadUrl, {
         *         headers: {
         *           'Authorization': `Bearer ${process.env.INBOUND_API_KEY}`
         *         }
         *       })
         *
         *       if (response.ok) {
         *         const fileBuffer = await response.arrayBuffer()
         *         // Process the file...
         *       }
         *     }
         *     ```
         *
         *     > **Note:** Authentication via API key in the Authorization header is required to download attachments.
         */
        post: operations["webhooks.emailReceived"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    "attachments.retrieve": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                filename: string;
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Binary attachment content */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        details?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        details?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        details?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        details?: string;
                        error: string;
                    };
                };
            };
        };
    };
    "blocklist.unblock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    emailAddress: string;
                };
                "application/x-www-form-urlencoded": {
                    /** Format: email */
                    emailAddress: string;
                };
                "multipart/form-data": {
                    /** Format: email */
                    emailAddress: string;
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        domain: string;
                        emailAddress: string;
                        message: string;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 429 */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "domains.list": {
        parameters: {
            query?: {
                canReceive?: "true" | "false";
                check?: "true";
                limit?: string | number;
                offset?: string | number;
                status?: "pending" | "verified" | "failed";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            canReceiveEmails: boolean;
                            catchAllEndpoint?: {
                                id: string;
                                isActive: boolean;
                                name: string;
                                type: string;
                            } | null;
                            catchAllEndpointId: string | null;
                            /** Format: date-time */
                            createdAt: string;
                            domain: string;
                            domainProvider: string | null;
                            hasMxRecords: boolean;
                            id: string;
                            isCatchAllEnabled: boolean;
                            lastDnsCheck: string | null;
                            lastSesCheck: string | null;
                            mailFromDomain: string | null;
                            mailFromDomainStatus: string | null;
                            mailFromDomainVerifiedAt: string | null;
                            providerConfidence: string | null;
                            receiveDmarcEmails: boolean;
                            stats: {
                                activeEmailAddresses: number;
                                hasCatchAll: boolean;
                                totalEmailAddresses: number;
                            };
                            status: string;
                            /** Format: date-time */
                            updatedAt: string;
                            userId: string;
                            verificationCheck?: {
                                dnsRecords: {
                                    error?: string;
                                    isVerified: boolean;
                                    name: string;
                                    type: string;
                                    value: string;
                                }[];
                                isFullyVerified: boolean;
                                /** Format: date-time */
                                lastChecked: string;
                                sesStatus: string;
                            };
                        }[];
                        pagination: {
                            hasMore: boolean;
                            limit: number;
                            offset: number;
                            total: number;
                        };
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message?: string;
                        statusCode?: number;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message?: string;
                        statusCode?: number;
                    };
                };
            };
        };
    };
    "domains.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    domain: string;
                };
                "application/x-www-form-urlencoded": {
                    domain: string;
                };
                "multipart/form-data": {
                    domain: string;
                };
            };
        };
        responses: {
            /** @description Response for status 201 */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        canReceiveEmails: boolean;
                        /** Format: date-time */
                        createdAt: string;
                        dnsConflict?: {
                            /** @enum {string} */
                            conflictType?: "mx" | "cname" | "both";
                            existingRecords?: {
                                type: string;
                                value: string;
                            }[];
                            hasConflict: boolean;
                            message: string;
                        };
                        dnsRecords: {
                            description?: string;
                            isRequired: boolean;
                            name: string;
                            type: string;
                            value: string;
                        }[];
                        domain: string;
                        domainProvider: string | null;
                        hasMxRecords: boolean;
                        id: string;
                        mailFromDomain?: string;
                        mailFromDomainStatus?: string;
                        message?: string;
                        parentDomain?: string;
                        providerConfidence: string | null;
                        /** @enum {string} */
                        status: "pending" | "verified" | "failed";
                        /** Format: date-time */
                        updatedAt: string;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 403 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 409 */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
        };
    };
    "domains.retrieve": {
        parameters: {
            query?: {
                check?: "true";
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        authRecommendations?: {
                            dmarc?: {
                                description: string;
                                name: string;
                                value: string;
                            };
                            spf?: {
                                description: string;
                                name: string;
                                value: string;
                            };
                        };
                        canReceiveEmails: boolean;
                        catchAllEndpoint?: {
                            id: string;
                            isActive: boolean;
                            name: string;
                            type: string;
                        } | null;
                        catchAllEndpointId: string | null;
                        /** Format: date-time */
                        createdAt: string;
                        dnsRecords: {
                            /** Format: date-time */
                            createdAt: string;
                            domainId: string;
                            id: string;
                            isRequired: boolean;
                            isVerified: boolean;
                            lastChecked: string | null;
                            name: string;
                            recordType: string;
                            value: string;
                        }[];
                        domain: string;
                        domainProvider: string | null;
                        hasMxRecords: boolean;
                        id: string;
                        inheritsFromParent?: boolean;
                        isCatchAllEnabled: boolean;
                        lastDnsCheck: string | null;
                        lastSesCheck: string | null;
                        mailFromDomain: string | null;
                        mailFromDomainStatus: string | null;
                        mailFromDomainVerifiedAt: string | null;
                        parentDomain?: string | null;
                        providerConfidence: string | null;
                        receiveDmarcEmails: boolean;
                        stats: {
                            activeEmailAddresses: number;
                            emailsLast7d: number;
                            emailsLast24h: number;
                            emailsLast30d: number;
                            totalEmailAddresses: number;
                        };
                        status: string;
                        /** Format: date-time */
                        updatedAt: string;
                        userId: string;
                        verificationCheck?: {
                            dkimStatus?: string;
                            dkimTokens?: string[];
                            dkimVerified?: boolean;
                            dnsRecords: {
                                error?: string;
                                isVerified: boolean;
                                name: string;
                                type: string;
                                value: string;
                            }[];
                            isFullyVerified: boolean;
                            /** Format: date-time */
                            lastChecked: string;
                            mailFromDomain?: string;
                            mailFromStatus?: string;
                            mailFromVerified?: boolean;
                            sesStatus: string;
                        };
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "domains.delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        deletedResources: {
                            blockedEmails: number;
                            dnsRecords: number;
                            domain: string;
                            emailAddresses: number;
                            sesIdentity: boolean;
                            sesReceiptRules: boolean;
                        };
                        message: string;
                        success: boolean;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        dependentSubdomains?: {
                            domain: string;
                            id: string;
                            status: string;
                        }[];
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        dependentSubdomains?: {
                            domain: string;
                            id: string;
                            status: string;
                        }[];
                        error: string;
                    };
                };
            };
            /** @description Response for status 409 */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        dependentSubdomains?: {
                            domain: string;
                            id: string;
                            status: string;
                        }[];
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        dependentSubdomains?: {
                            domain: string;
                            id: string;
                            status: string;
                        }[];
                        error: string;
                    };
                };
            };
        };
    };
    "domains.update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    catchAllEndpointId?: string | null;
                    isCatchAllEnabled: boolean;
                };
                "application/x-www-form-urlencoded": {
                    catchAllEndpointId?: string | null;
                    isCatchAllEnabled: boolean;
                };
                "multipart/form-data": {
                    catchAllEndpointId?: string | null;
                    isCatchAllEnabled: boolean;
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        catchAllEndpoint?: {
                            id: string;
                            isActive: boolean;
                            name: string;
                            type: string;
                        } | null;
                        catchAllEndpointId: string | null;
                        domain: string;
                        id: string;
                        isCatchAllEnabled: boolean;
                        status: string;
                        /** Format: date-time */
                        updatedAt: string;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "emailAddresses.list": {
        parameters: {
            query?: {
                domainId?: string;
                isActive?: "true" | "false";
                isReceiptRuleConfigured?: "true" | "false";
                limit?: string | number;
                offset?: string | number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            address: string;
                            /** Format: date-time */
                            createdAt: string;
                            domain: {
                                id: string;
                                name: string;
                                status: string;
                            };
                            domainId: string;
                            endpointId: string | null;
                            id: string;
                            isActive: boolean;
                            isReceiptRuleConfigured: boolean;
                            receiptRuleName: string | null;
                            routing: {
                                config?: unknown;
                                id: string | null;
                                isActive: boolean;
                                name: string | null;
                                /** @enum {string} */
                                type: "webhook" | "endpoint" | "none";
                            };
                            /** Format: date-time */
                            updatedAt: string;
                            userId: string;
                            webhookId: string | null;
                        }[];
                        pagination: {
                            hasMore: boolean;
                            limit: number;
                            offset: number;
                            total: number;
                        };
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
        };
    };
    "emailAddresses.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    address: string;
                    domainId: string;
                    endpointId?: string;
                    /** @default true */
                    isActive?: boolean;
                    webhookId?: string;
                };
                "application/x-www-form-urlencoded": {
                    address: string;
                    domainId: string;
                    endpointId?: string;
                    /** @default true */
                    isActive?: boolean;
                    webhookId?: string;
                };
                "multipart/form-data": {
                    address: string;
                    domainId: string;
                    endpointId?: string;
                    /** @default true */
                    isActive?: boolean;
                    webhookId?: string;
                };
            };
        };
        responses: {
            /** @description Response for status 201 */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        address: string;
                        /** Format: date-time */
                        createdAt: string;
                        domain: {
                            id: string;
                            name: string;
                            status: string;
                        };
                        domainId: string;
                        endpointId: string | null;
                        id: string;
                        isActive: boolean;
                        isReceiptRuleConfigured: boolean;
                        receiptRuleName: string | null;
                        routing: {
                            config?: unknown;
                            id: string | null;
                            isActive: boolean;
                            name: string | null;
                            /** @enum {string} */
                            type: "webhook" | "endpoint" | "none";
                        };
                        /** Format: date-time */
                        updatedAt: string;
                        userId: string;
                        warning?: string;
                        webhookId: string | null;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                        required?: string[];
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                        required?: string[];
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                        required?: string[];
                    };
                };
            };
            /** @description Response for status 409 */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                        required?: string[];
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                        required?: string[];
                    };
                };
            };
        };
    };
    "emailAddresses.retrieve": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        address: string;
                        /** Format: date-time */
                        createdAt: string;
                        domain: {
                            id: string;
                            name: string;
                            status: string;
                        };
                        domainId: string;
                        endpointId: string | null;
                        id: string;
                        isActive: boolean;
                        isReceiptRuleConfigured: boolean;
                        receiptRuleName: string | null;
                        routing: {
                            config?: unknown;
                            id: string | null;
                            isActive: boolean;
                            name: string | null;
                            /** @enum {string} */
                            type: "webhook" | "endpoint" | "none";
                        };
                        /** Format: date-time */
                        updatedAt: string;
                        userId: string;
                        webhookId: string | null;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
        };
    };
    "emailAddresses.update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    endpointId?: string | null;
                    isActive?: boolean;
                    webhookId?: string | null;
                };
                "application/x-www-form-urlencoded": {
                    endpointId?: string | null;
                    isActive?: boolean;
                    webhookId?: string | null;
                };
                "multipart/form-data": {
                    endpointId?: string | null;
                    isActive?: boolean;
                    webhookId?: string | null;
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        address: string;
                        /** Format: date-time */
                        createdAt: string;
                        domain: {
                            id: string;
                            name: string;
                            status: string;
                        };
                        domainId: string;
                        endpointId: string | null;
                        id: string;
                        isActive: boolean;
                        isReceiptRuleConfigured: boolean;
                        receiptRuleName: string | null;
                        routing: {
                            config?: unknown;
                            id: string | null;
                            isActive: boolean;
                            name: string | null;
                            /** @enum {string} */
                            type: "webhook" | "endpoint" | "none";
                        };
                        /** Format: date-time */
                        updatedAt: string;
                        userId: string;
                        warning?: string;
                        webhookId: string | null;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
        };
    };
    "emailAddresses.delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        cleanup: {
                            domain: string;
                            emailAddress: string;
                            sesRuleUpdated: boolean;
                            warning?: string;
                        };
                        message: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        code?: string;
                        error: string;
                    };
                };
            };
        };
    };
    "emails.list": {
        parameters: {
            query?: {
                address?: string;
                domain?: string;
                limit?: string;
                offset?: string;
                search?: string;
                status?: "all" | "delivered" | "pending" | "failed" | "bounced" | "scheduled" | "cancelled" | "unread" | "read" | "archived";
                time_range?: "1h" | "24h" | "7d" | "30d" | "90d" | "all";
                type?: "all" | "sent" | "received" | "scheduled";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Array of email objects matching the query */
                        data: {
                            /** @description Number of attachments on the email */
                            attachment_count?: number;
                            /** @description Array of CC recipient email addresses */
                            cc?: string[];
                            /** @description ISO 8601 timestamp when the email was created/received */
                            created_at: string;
                            /** @description Sender email address */
                            from: string;
                            from_name?: string | null;
                            /** @description Whether the email has any attachments */
                            has_attachments: boolean;
                            /** @description Unique identifier for the email */
                            id: string;
                            /** @description Whether the email has been archived (only for received emails) */
                            is_archived?: boolean;
                            /** @description Whether the email has been read (only for received emails) */
                            is_read?: boolean;
                            message_id?: string | null;
                            preview?: string | null;
                            read_at?: string | null;
                            scheduled_at?: string | null;
                            sent_at?: string | null;
                            /** @description Current status of the email (delivered, pending, failed, bounced, scheduled, cancelled) */
                            status: string;
                            /** @description Email subject line */
                            subject: string;
                            thread_id?: string | null;
                            /** @description Array of recipient email addresses */
                            to: string[];
                            /** @enum {string} */
                            type: "sent" | "received" | "scheduled";
                        }[];
                        /** @description Applied filters for this query */
                        filters: {
                            /** @description Applied address filter */
                            address?: string;
                            /** @description Applied domain filter */
                            domain?: string;
                            /** @description Applied search query */
                            search?: string;
                            /** @description Applied status filter */
                            status?: string;
                            /** @description Applied time range filter */
                            time_range?: string;
                            /** @description Applied type filter */
                            type?: string;
                        };
                        /** @description Pagination metadata */
                        pagination: {
                            /** @description Whether there are more results available */
                            has_more: boolean;
                            /** @description Number of results per page */
                            limit: number;
                            /** @description Number of results skipped */
                            offset: number;
                            /** @description Total number of matching emails */
                            total: number;
                        };
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Error message describing what went wrong */
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Error message describing what went wrong */
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Error message describing what went wrong */
                        error: string;
                    };
                };
            };
        };
    };
    "emails.send": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    attachments?: {
                        content?: string;
                        content_id?: string;
                        content_type?: string;
                        filename: string;
                        path?: string;
                    }[];
                    bcc?: string | string[];
                    cc?: string | string[];
                    /** @description Sender email address */
                    from: string;
                    /** @description Custom email headers */
                    headers?: {
                        [key: string]: string;
                    };
                    /** @description HTML content of the email */
                    html?: string;
                    reply_to?: string | string[];
                    /** @description ISO 8601 date or natural language for scheduling */
                    scheduled_at?: string;
                    /** @description Email subject */
                    subject: string;
                    tags?: {
                        name: string;
                        value: string;
                    }[];
                    /** @description Plain text content of the email */
                    text?: string;
                    /** @description Timezone for natural language parsing */
                    timezone?: string;
                    /** @description Recipient email address(es) */
                    to: string | string[];
                };
                "application/x-www-form-urlencoded": {
                    attachments?: {
                        content?: string;
                        content_id?: string;
                        content_type?: string;
                        filename: string;
                        path?: string;
                    }[];
                    bcc?: string | string[];
                    cc?: string | string[];
                    /** @description Sender email address */
                    from: string;
                    /** @description Custom email headers */
                    headers?: {
                        [key: string]: string;
                    };
                    /** @description HTML content of the email */
                    html?: string;
                    reply_to?: string | string[];
                    /** @description ISO 8601 date or natural language for scheduling */
                    scheduled_at?: string;
                    /** @description Email subject */
                    subject: string;
                    tags?: {
                        name: string;
                        value: string;
                    }[];
                    /** @description Plain text content of the email */
                    text?: string;
                    /** @description Timezone for natural language parsing */
                    timezone?: string;
                    /** @description Recipient email address(es) */
                    to: string | string[];
                };
                "multipart/form-data": {
                    attachments?: {
                        content?: string;
                        content_id?: string;
                        content_type?: string;
                        filename: string;
                        path?: string;
                    }[];
                    bcc?: string | string[];
                    cc?: string | string[];
                    /** @description Sender email address */
                    from: string;
                    /** @description Custom email headers */
                    headers?: {
                        [key: string]: string;
                    };
                    /** @description HTML content of the email */
                    html?: string;
                    reply_to?: string | string[];
                    /** @description ISO 8601 date or natural language for scheduling */
                    scheduled_at?: string;
                    /** @description Email subject */
                    subject: string;
                    tags?: {
                        name: string;
                        value: string;
                    }[];
                    /** @description Plain text content of the email */
                    text?: string;
                    /** @description Timezone for natural language parsing */
                    timezone?: string;
                    /** @description Recipient email address(es) */
                    to: string | string[];
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        message_id?: string;
                        scheduled_at?: string;
                        /** @enum {string} */
                        status?: "sent" | "scheduled";
                        timezone?: string;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 403 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 429 */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "emails.retrieve": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        attachments?: unknown[];
                        bcc?: string[] | null;
                        cc?: string[] | null;
                        created_at: string;
                        from: string;
                        has_attachments: boolean;
                        headers?: unknown;
                        html?: string | null;
                        id: string;
                        is_read?: boolean;
                        /** @constant */
                        object: "email";
                        reply_to?: string[] | null;
                        scheduled_at?: string | null;
                        sent_at?: string | null;
                        status: string;
                        subject: string;
                        tags?: unknown[];
                        text?: string | null;
                        thread_id?: string | null;
                        thread_position?: number | null;
                        to: string[];
                        /** @enum {string} */
                        type: "sent" | "received" | "scheduled";
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "emails.cancel": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        message: string;
                        success: boolean;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "emails.update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    is_archived?: boolean;
                    is_read?: boolean;
                };
                "application/x-www-form-urlencoded": {
                    is_archived?: boolean;
                    is_read?: boolean;
                };
                "multipart/form-data": {
                    is_archived?: boolean;
                    is_read?: boolean;
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        is_archived: boolean;
                        is_read: boolean;
                        /** @constant */
                        object: "email";
                        updated_at: string;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "emails.reply": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    attachments?: {
                        content?: string;
                        content_id?: string;
                        content_type?: string;
                        filename: string;
                        path?: string;
                    }[];
                    /** @description Sender email address */
                    from: string;
                    /** @description Custom email headers */
                    headers?: {
                        [key: string]: string;
                    };
                    /** @description HTML content of the email */
                    html?: string;
                    /** @description Include original CC recipients */
                    reply_all?: boolean;
                    /** @description Email subject - defaults to Re: original subject */
                    subject?: string;
                    tags?: {
                        name: string;
                        value: string;
                    }[];
                    /** @description Plain text content of the email */
                    text?: string;
                    /** @description Recipient email address(es) - defaults to original sender */
                    to?: string | string[];
                };
                "application/x-www-form-urlencoded": {
                    attachments?: {
                        content?: string;
                        content_id?: string;
                        content_type?: string;
                        filename: string;
                        path?: string;
                    }[];
                    /** @description Sender email address */
                    from: string;
                    /** @description Custom email headers */
                    headers?: {
                        [key: string]: string;
                    };
                    /** @description HTML content of the email */
                    html?: string;
                    /** @description Include original CC recipients */
                    reply_all?: boolean;
                    /** @description Email subject - defaults to Re: original subject */
                    subject?: string;
                    tags?: {
                        name: string;
                        value: string;
                    }[];
                    /** @description Plain text content of the email */
                    text?: string;
                    /** @description Recipient email address(es) - defaults to original sender */
                    to?: string | string[];
                };
                "multipart/form-data": {
                    attachments?: {
                        content?: string;
                        content_id?: string;
                        content_type?: string;
                        filename: string;
                        path?: string;
                    }[];
                    /** @description Sender email address */
                    from: string;
                    /** @description Custom email headers */
                    headers?: {
                        [key: string]: string;
                    };
                    /** @description HTML content of the email */
                    html?: string;
                    /** @description Include original CC recipients */
                    reply_all?: boolean;
                    /** @description Email subject - defaults to Re: original subject */
                    subject?: string;
                    tags?: {
                        name: string;
                        value: string;
                    }[];
                    /** @description Plain text content of the email */
                    text?: string;
                    /** @description Recipient email address(es) - defaults to original sender */
                    to?: string | string[];
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        aws_message_id: string;
                        id: string;
                        is_thread_reply: boolean;
                        message_id: string;
                        replied_to_email_id: string;
                        replied_to_thread_id?: string;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 403 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 429 */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "emails.retry": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Specific delivery ID to retry. If provided, retries that specific delivery. */
                    delivery_id?: string;
                    /** @description Endpoint ID to retry delivery to. If not provided, retries to all configured endpoints. */
                    endpoint_id?: string;
                };
                "application/x-www-form-urlencoded": {
                    /** @description Specific delivery ID to retry. If provided, retries that specific delivery. */
                    delivery_id?: string;
                    /** @description Endpoint ID to retry delivery to. If not provided, retries to all configured endpoints. */
                    endpoint_id?: string;
                };
                "multipart/form-data": {
                    /** @description Specific delivery ID to retry. If provided, retries that specific delivery. */
                    delivery_id?: string;
                    /** @description Endpoint ID to retry delivery to. If not provided, retries to all configured endpoints. */
                    endpoint_id?: string;
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        delivery_id?: string;
                        message: string;
                        success: boolean;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "endpoints.list": {
        parameters: {
            query?: {
                active?: "true" | "false";
                limit?: string | number;
                offset?: string | number;
                search?: string;
                sortBy?: "newest" | "oldest";
                type?: "webhook" | "email" | "email_group";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            config: unknown;
                            createdAt: string;
                            deliveryStats: {
                                failed: number;
                                lastDelivery: string | null;
                                successful: number;
                                total: number;
                            };
                            description: string | null;
                            groupEmails: string[] | null;
                            id: string;
                            isActive: boolean;
                            name: string;
                            /** @enum {string} */
                            type: "webhook" | "email" | "email_group";
                            updatedAt: string;
                            userId: string;
                        }[];
                        pagination: {
                            hasMore: boolean;
                            limit: number;
                            offset: number;
                            total: number;
                        };
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
        };
    };
    "endpoints.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    config: {
                        /** @description Custom headers to include with webhook requests */
                        headers?: {
                            [key: string]: string;
                        };
                        retryAttempts?: number;
                        timeout?: number;
                        url: string;
                    } | {
                        /** Format: email */
                        forwardTo: string;
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    } | {
                        emails: string[];
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    };
                    description?: string;
                    name: string;
                    /** @enum {string} */
                    type: "webhook" | "email" | "email_group";
                };
                "application/x-www-form-urlencoded": {
                    config: {
                        /** @description Custom headers to include with webhook requests */
                        headers?: {
                            [key: string]: string;
                        };
                        retryAttempts?: number;
                        timeout?: number;
                        url: string;
                    } | {
                        /** Format: email */
                        forwardTo: string;
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    } | {
                        emails: string[];
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    };
                    description?: string;
                    name: string;
                    /** @enum {string} */
                    type: "webhook" | "email" | "email_group";
                };
                "multipart/form-data": {
                    config: {
                        /** @description Custom headers to include with webhook requests */
                        headers?: {
                            [key: string]: string;
                        };
                        retryAttempts?: number;
                        timeout?: number;
                        url: string;
                    } | {
                        /** Format: email */
                        forwardTo: string;
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    } | {
                        emails: string[];
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    };
                    description?: string;
                    name: string;
                    /** @enum {string} */
                    type: "webhook" | "email" | "email_group";
                };
            };
        };
        responses: {
            /** @description Response for status 201 */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        config: unknown;
                        createdAt: string;
                        deliveryStats: {
                            failed: number;
                            lastDelivery: string | null;
                            successful: number;
                            total: number;
                        };
                        description: string | null;
                        groupEmails: string[] | null;
                        id: string;
                        isActive: boolean;
                        name: string;
                        /** @enum {string} */
                        type: "webhook" | "email" | "email_group";
                        updatedAt: string;
                        userId: string;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        details?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
        };
    };
    "endpoints.retrieve": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        associatedEmails: {
                            address: string;
                            createdAt: string | null;
                            id: string;
                            isActive: boolean;
                        }[];
                        catchAllDomains: {
                            domain: string;
                            id: string;
                            status: string;
                        }[];
                        config: unknown;
                        createdAt: string | null;
                        deliveryStats: {
                            failed: number;
                            lastDelivery: string | null;
                            successful: number;
                            total: number;
                        };
                        description: string | null;
                        groupEmails: string[] | null;
                        id: string;
                        isActive: boolean;
                        name: string;
                        recentDeliveries: {
                            attempts: number;
                            createdAt: string | null;
                            deliveryType: string;
                            emailId: string | null;
                            id: string;
                            lastAttemptAt: string | null;
                            responseData: unknown;
                            status: string;
                        }[];
                        /** @enum {string} */
                        type: "webhook" | "email" | "email_group";
                        updatedAt: string | null;
                        userId: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
        };
    };
    "endpoints.update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    config?: {
                        /** @description Custom headers to include with webhook requests */
                        headers?: {
                            [key: string]: string;
                        };
                        retryAttempts?: number;
                        timeout?: number;
                        url: string;
                    } | {
                        /** Format: email */
                        forwardTo: string;
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    } | {
                        emails: string[];
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    };
                    description?: string;
                    isActive?: boolean;
                    name?: string;
                    /** @enum {string} */
                    webhookFormat?: "inbound" | "discord" | "slack";
                };
                "application/x-www-form-urlencoded": {
                    config?: {
                        /** @description Custom headers to include with webhook requests */
                        headers?: {
                            [key: string]: string;
                        };
                        retryAttempts?: number;
                        timeout?: number;
                        url: string;
                    } | {
                        /** Format: email */
                        forwardTo: string;
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    } | {
                        emails: string[];
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    };
                    description?: string;
                    isActive?: boolean;
                    name?: string;
                    /** @enum {string} */
                    webhookFormat?: "inbound" | "discord" | "slack";
                };
                "multipart/form-data": {
                    config?: {
                        /** @description Custom headers to include with webhook requests */
                        headers?: {
                            [key: string]: string;
                        };
                        retryAttempts?: number;
                        timeout?: number;
                        url: string;
                    } | {
                        /** Format: email */
                        forwardTo: string;
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    } | {
                        emails: string[];
                        /** Format: email */
                        fromAddress?: string;
                        includeAttachments?: boolean;
                        preserveHeaders?: boolean;
                        senderName?: string;
                        subjectPrefix?: string;
                    };
                    description?: string;
                    isActive?: boolean;
                    name?: string;
                    /** @enum {string} */
                    webhookFormat?: "inbound" | "discord" | "slack";
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        config: unknown;
                        createdAt: string | null;
                        description: string | null;
                        groupEmails: string[] | null;
                        id: string;
                        isActive: boolean;
                        name: string;
                        /** @enum {string} */
                        type: "webhook" | "email" | "email_group";
                        updatedAt: string | null;
                        userId: string;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        details?: string;
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
        };
    };
    "endpoints.delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        cleanup: {
                            deliveriesDeleted: number;
                            domains: string[];
                            domainsUpdated: number;
                            emailAddresses: string[];
                            emailAddressesUpdated: number;
                            groupEmailsDeleted: number;
                        };
                        message: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
        };
    };
    "endpoints.test": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    overrideUrl?: string;
                    /** @enum {string} */
                    webhookFormat?: "inbound" | "discord" | "slack";
                };
                "application/x-www-form-urlencoded": {
                    overrideUrl?: string;
                    /** @enum {string} */
                    webhookFormat?: "inbound" | "discord" | "slack";
                };
                "multipart/form-data": {
                    overrideUrl?: string;
                    /** @enum {string} */
                    webhookFormat?: "inbound" | "discord" | "slack";
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error?: string;
                        message: string;
                        responseBody?: string;
                        responseTime: number;
                        statusCode?: number;
                        success: boolean;
                        testPayload?: unknown;
                        urlTested?: string;
                        /** @enum {string} */
                        webhookFormat?: "inbound" | "discord" | "slack";
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        validFormats?: string[];
                    } | {
                        message: string;
                        responseTime: number;
                        /** @constant */
                        success: false;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message: string;
                        statusCode: number;
                    };
                };
            };
        };
    };
    "guard.list": {
        parameters: {
            query?: {
                isActive?: string;
                limit?: string;
                offset?: string;
                search?: string;
                type?: "explicit" | "ai_prompt";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            actions: string | null;
                            config: string;
                            createdAt: string | null;
                            description: string | null;
                            id: string;
                            isActive: boolean | null;
                            lastTriggeredAt: string | null;
                            name: string;
                            priority: number | null;
                            triggerCount: number | null;
                            type: string;
                            updatedAt: string | null;
                            userId: string;
                        }[];
                        pagination: {
                            hasMore: boolean;
                            limit: number;
                            offset: number;
                            total: number;
                        };
                        /** @constant */
                        success: true;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "guard.create": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Action to take when the rule matches: allow, block, or route to an owned endpoint. Defaults to allow when omitted. */
                    action?: {
                        /** @constant */
                        action: "allow";
                    } | {
                        /** @constant */
                        action: "block";
                    } | {
                        /** @constant */
                        action: "route";
                        /** @description ID of an active endpoint owned by the account. */
                        endpointId: string;
                    };
                    /** @description Configuration matching the selected rule type. See the request examples for complete explicit and AI configurations. */
                    config: {
                        from?: {
                            /**
                             * @description OR matches any address; AND requires every pattern to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Exact email addresses or whole-domain patterns such as *@example.com. */
                            values: string[];
                        };
                        /** @description Match emails based on whether they contain attachments. */
                        hasAttachment?: boolean;
                        hasWords?: {
                            /**
                             * @description OR matches any value; AND requires every value to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Case-insensitive substrings to match. */
                            values: string[];
                        };
                        /** @enum {string} */
                        mode?: "simple" | "advanced";
                        prompt?: never;
                        subject?: {
                            /**
                             * @description OR matches any value; AND requires every value to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Case-insensitive substrings to match. */
                            values: string[];
                        };
                        to?: {
                            /**
                             * @description OR matches any address; AND requires every pattern to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Exact email addresses or whole-domain patterns such as *@example.com. */
                            values: string[];
                        };
                    } | {
                        /** @enum {string} */
                        mode?: "simple" | "advanced";
                        /** @description Natural-language description of when the rule should match. */
                        prompt: string;
                    };
                    /** @description Optional explanation of what the rule handles. */
                    description?: string;
                    /** @description A descriptive name for the rule. */
                    name: string;
                    /**
                     * @description Evaluation priority. Higher values run first; the first matching rule wins. Defaults to 0.
                     * @default 0
                     */
                    priority?: number;
                    /** @enum {string} */
                    type: "explicit" | "ai_prompt";
                };
                "application/x-www-form-urlencoded": {
                    /** @description Action to take when the rule matches: allow, block, or route to an owned endpoint. Defaults to allow when omitted. */
                    action?: {
                        /** @constant */
                        action: "allow";
                    } | {
                        /** @constant */
                        action: "block";
                    } | {
                        /** @constant */
                        action: "route";
                        /** @description ID of an active endpoint owned by the account. */
                        endpointId: string;
                    };
                    /** @description Configuration matching the selected rule type. See the request examples for complete explicit and AI configurations. */
                    config: {
                        from?: {
                            /**
                             * @description OR matches any address; AND requires every pattern to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Exact email addresses or whole-domain patterns such as *@example.com. */
                            values: string[];
                        };
                        /** @description Match emails based on whether they contain attachments. */
                        hasAttachment?: boolean;
                        hasWords?: {
                            /**
                             * @description OR matches any value; AND requires every value to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Case-insensitive substrings to match. */
                            values: string[];
                        };
                        /** @enum {string} */
                        mode?: "simple" | "advanced";
                        prompt?: never;
                        subject?: {
                            /**
                             * @description OR matches any value; AND requires every value to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Case-insensitive substrings to match. */
                            values: string[];
                        };
                        to?: {
                            /**
                             * @description OR matches any address; AND requires every pattern to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Exact email addresses or whole-domain patterns such as *@example.com. */
                            values: string[];
                        };
                    } | {
                        /** @enum {string} */
                        mode?: "simple" | "advanced";
                        /** @description Natural-language description of when the rule should match. */
                        prompt: string;
                    };
                    /** @description Optional explanation of what the rule handles. */
                    description?: string;
                    /** @description A descriptive name for the rule. */
                    name: string;
                    /**
                     * @description Evaluation priority. Higher values run first; the first matching rule wins. Defaults to 0.
                     * @default 0
                     */
                    priority?: number;
                    /** @enum {string} */
                    type: "explicit" | "ai_prompt";
                };
                "multipart/form-data": {
                    /** @description Action to take when the rule matches: allow, block, or route to an owned endpoint. Defaults to allow when omitted. */
                    action?: {
                        /** @constant */
                        action: "allow";
                    } | {
                        /** @constant */
                        action: "block";
                    } | {
                        /** @constant */
                        action: "route";
                        /** @description ID of an active endpoint owned by the account. */
                        endpointId: string;
                    };
                    /** @description Configuration matching the selected rule type. See the request examples for complete explicit and AI configurations. */
                    config: {
                        from?: {
                            /**
                             * @description OR matches any address; AND requires every pattern to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Exact email addresses or whole-domain patterns such as *@example.com. */
                            values: string[];
                        };
                        /** @description Match emails based on whether they contain attachments. */
                        hasAttachment?: boolean;
                        hasWords?: {
                            /**
                             * @description OR matches any value; AND requires every value to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Case-insensitive substrings to match. */
                            values: string[];
                        };
                        /** @enum {string} */
                        mode?: "simple" | "advanced";
                        prompt?: never;
                        subject?: {
                            /**
                             * @description OR matches any value; AND requires every value to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Case-insensitive substrings to match. */
                            values: string[];
                        };
                        to?: {
                            /**
                             * @description OR matches any address; AND requires every pattern to match.
                             * @enum {string}
                             */
                            operator: "OR" | "AND";
                            /** @description Exact email addresses or whole-domain patterns such as *@example.com. */
                            values: string[];
                        };
                    } | {
                        /** @enum {string} */
                        mode?: "simple" | "advanced";
                        /** @description Natural-language description of when the rule should match. */
                        prompt: string;
                    };
                    /** @description Optional explanation of what the rule handles. */
                    description?: string;
                    /** @description A descriptive name for the rule. */
                    name: string;
                    /**
                     * @description Evaluation priority. Higher values run first; the first matching rule wins. Defaults to 0.
                     * @default 0
                     */
                    priority?: number;
                    /** @enum {string} */
                    type: "explicit" | "ai_prompt";
                };
            };
        };
        responses: {
            /** @description The newly created active guard rule. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            actions: string | null;
                            config: string;
                            createdAt: string | null;
                            description: string | null;
                            id: string;
                            isActive: boolean | null;
                            lastTriggeredAt: string | null;
                            name: string;
                            priority: number | null;
                            triggerCount: number | null;
                            type: string;
                            updatedAt: string | null;
                            userId: string;
                        };
                        /** @constant */
                        success: true;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "guard.retrieve": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        actions: string | null;
                        config: string;
                        createdAt: string | null;
                        description: string | null;
                        id: string;
                        isActive: boolean | null;
                        lastTriggeredAt: string | null;
                        name: string;
                        priority: number | null;
                        triggerCount: number | null;
                        type: string;
                        updatedAt: string | null;
                        userId: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "guard.update": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Rule action configuration */
                    action?: unknown;
                    /** @description Rule configuration (JSON) */
                    config?: unknown;
                    /** @description Rule description */
                    description?: string;
                    /** @description Whether the rule is active */
                    isActive?: boolean;
                    /** @description Rule name */
                    name?: string;
                    /** @description Rule priority */
                    priority?: number;
                };
                "application/x-www-form-urlencoded": {
                    /** @description Rule action configuration */
                    action?: unknown;
                    /** @description Rule configuration (JSON) */
                    config?: unknown;
                    /** @description Rule description */
                    description?: string;
                    /** @description Whether the rule is active */
                    isActive?: boolean;
                    /** @description Rule name */
                    name?: string;
                    /** @description Rule priority */
                    priority?: number;
                };
                "multipart/form-data": {
                    /** @description Rule action configuration */
                    action?: unknown;
                    /** @description Rule configuration (JSON) */
                    config?: unknown;
                    /** @description Rule description */
                    description?: string;
                    /** @description Whether the rule is active */
                    isActive?: boolean;
                    /** @description Rule name */
                    name?: string;
                    /** @description Rule priority */
                    priority?: number;
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        actions: string | null;
                        config: string;
                        createdAt: string | null;
                        description: string | null;
                        id: string;
                        isActive: boolean | null;
                        lastTriggeredAt: string | null;
                        name: string;
                        priority: number | null;
                        triggerCount: number | null;
                        type: string;
                        updatedAt: string | null;
                        userId: string;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "guard.delete": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        success: boolean;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "guard.check": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description ID of the email to test against the rule */
                    structuredEmailId: string;
                };
                "application/x-www-form-urlencoded": {
                    /** @description ID of the email to test against the rule */
                    structuredEmailId: string;
                };
                "multipart/form-data": {
                    /** @description ID of the email to test against the rule */
                    structuredEmailId: string;
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        matchDetails?: {
                            criteria: string;
                            value: string;
                        }[];
                        matched: boolean;
                        reason?: string;
                    } | {
                        error: string;
                        /** @constant */
                        matched: false;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "guard.generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Natural language description of the rule */
                    prompt: string;
                };
                "application/x-www-form-urlencoded": {
                    /** @description Natural language description of the rule */
                    prompt: string;
                };
                "multipart/form-data": {
                    /** @description Natural language description of the rule */
                    prompt: string;
                };
            };
        };
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        config: {
                            from?: {
                                operator: "OR" | "AND";
                                values: string[];
                            };
                            hasAttachment?: boolean;
                            hasWords?: {
                                operator: "OR" | "AND";
                                values: string[];
                            };
                            mode?: "simple" | "advanced";
                            subject?: {
                                operator: "OR" | "AND";
                                values: string[];
                            };
                            to?: {
                                operator: "OR" | "AND";
                                values: string[];
                            };
                        };
                    } | {
                        config: Record<string, never>;
                        error: string;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                    };
                };
            };
        };
    };
    "mail.list": {
        parameters: {
            query?: {
                address?: string;
                cursor?: string;
                domain?: string;
                limit?: string;
                search?: string;
                unread?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Applied filters for this query */
                        filters: {
                            /** @description Applied address filter (resolved email address) */
                            address?: string;
                            /** @description Applied domain filter (resolved domain name) */
                            domain?: string;
                            /** @description Applied search query */
                            search?: string;
                            /** @description Whether filtering for unread threads only */
                            unread_only?: boolean;
                        };
                        /** @description Pagination metadata for cursor-based pagination */
                        pagination: {
                            /** @description Whether there are more threads available after this page */
                            has_more: boolean;
                            /** @description Number of results per page */
                            limit: number;
                            next_cursor?: string | null;
                        };
                        /** @description Array of thread objects matching the query, sorted by last message date (newest first) */
                        threads: {
                            /** @description ISO 8601 timestamp when the thread was created (first message received) */
                            created_at: string;
                            /** @description Whether the thread has any unread inbound messages */
                            has_unread: boolean;
                            /** @description Unique identifier for the thread */
                            id: string;
                            /** @description Whether the thread has been archived */
                            is_archived: boolean;
                            /** @description ISO 8601 timestamp of the most recent message in the thread */
                            last_message_at: string;
                            latest_message?: {
                                date?: string | null;
                                /** @description Formatted sender information (name and/or email) */
                                from_text: string;
                                /** @description Whether the message has any attachments */
                                has_attachments: boolean;
                                /** @description Unique identifier of the message */
                                id: string;
                                /** @description Whether the message has been read (always true for outbound) */
                                is_read: boolean;
                                subject?: string | null;
                                text_preview?: string | null;
                                /** @description Whether the message was received (inbound) or sent (outbound) */
                                type: "inbound" | "outbound";
                            } | null;
                            /** @description Total number of messages in the thread (both inbound and outbound) */
                            message_count: number;
                            normalized_subject?: string | null;
                            /** @description Array of all unique email addresses that have participated in this thread */
                            participant_emails: string[];
                            /** @description Array of formatted participant names in the format 'First Last <email@domain.com>' or just 'email@domain.com' if no name is available */
                            participant_names: string[];
                            /** @description RFC 2822 Message-ID of the first message in the thread */
                            root_message_id: string;
                            /** @description Number of unread messages in the thread */
                            unread_count?: number;
                        }[];
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Error message describing what went wrong */
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Error message describing what went wrong */
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Error message describing what went wrong */
                        error: string;
                    };
                };
            };
        };
    };
    "mail.retrieve": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Array of all messages in the thread, sorted by thread position (chronological) */
                        messages: {
                            /** @description Array of attachment metadata */
                            attachments: {
                                /** @description Base64-encoded content (if included) */
                                content?: string;
                                contentId?: string | null;
                                /** @description MIME type of the attachment */
                                contentType?: string;
                                /** @description Original filename of the attachment */
                                filename?: string;
                                /** @description Size of the attachment in bytes */
                                size?: number;
                            }[];
                            /** @description Array of BCC recipient email addresses */
                            bcc: string[];
                            /** @description Array of CC recipient email addresses */
                            cc: string[];
                            date?: string | null;
                            failure_reason?: string | null;
                            /** @description Formatted sender (display name and email) */
                            from: string;
                            from_address?: string | null;
                            from_name?: string | null;
                            /** @description Whether the message has any attachments */
                            has_attachments: boolean;
                            /** @description Raw email headers as key-value pairs */
                            headers: unknown;
                            html_body?: string | null;
                            /** @description Unique identifier for the message */
                            id: string;
                            in_reply_to?: string | null;
                            /** @description Whether the message has been read (always true for outbound) */
                            is_read: boolean;
                            message_id?: string | null;
                            read_at?: string | null;
                            received_at?: string | null;
                            /** @description Array of Message-IDs from the References header */
                            references: string[];
                            sent_at?: string | null;
                            /** @description Delivery status for outbound messages (pending, sent, failed, bounced) */
                            status?: string;
                            subject?: string | null;
                            /** @description Array of tags attached to the message (outbound only) */
                            tags: {
                                /** @description Tag name */
                                name: string;
                                /** @description Tag value */
                                value: string;
                            }[];
                            text_body?: string | null;
                            /** @description Position of the message in the thread (0 = first message) */
                            thread_position: number;
                            /** @description Array of recipient email addresses */
                            to: string[];
                            /** @enum {string} */
                            type: "inbound" | "outbound";
                        }[];
                        thread: {
                            /** @description ISO 8601 timestamp when the thread was created */
                            created_at: string;
                            /** @description Unique identifier for the thread */
                            id: string;
                            /** @description ISO 8601 timestamp of the most recent message */
                            last_message_at: string;
                            /** @description Total number of messages in the thread */
                            message_count: number;
                            normalized_subject?: string | null;
                            /** @description Array of all unique email addresses that have participated in this thread */
                            participant_emails: string[];
                            /** @description Array of formatted participant names in the format 'First Last <email@domain.com>' or just 'email@domain.com' if no name is available */
                            participant_names: string[];
                            /** @description RFC 2822 Message-ID of the first message in the thread */
                            root_message_id: string;
                            /** @description ISO 8601 timestamp when the thread was last updated */
                            updated_at: string;
                        };
                        /** @description Total number of messages returned */
                        total_count: number;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Error message describing what went wrong */
                        error: string;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Error message describing what went wrong */
                        error: string;
                    };
                };
            };
            /** @description Response for status 404 */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Error message describing what went wrong */
                        error: string;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description Error message describing what went wrong */
                        error: string;
                    };
                };
            };
        };
    };
    "onboarding.checkReply": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Response for status 200 */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        demo?: {
                            emailId: string;
                            recipientEmail: string;
                            sentAt: string;
                        };
                        hasDemoEmail: boolean;
                        hasReply: boolean;
                        reply?: {
                            body: string;
                            from: string;
                            receivedAt: string;
                            subject: string;
                        };
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message?: string;
                        statusCode?: number;
                    };
                };
            };
            /** @description Response for status 403 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message?: string;
                        statusCode?: number;
                    };
                };
            };
            /** @description Response for status 429 */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message?: string;
                        statusCode?: number;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message?: string;
                        statusCode?: number;
                    };
                };
            };
        };
    };
    "onboarding.sendDemo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Recipient email address */
                    to: string;
                };
                "application/x-www-form-urlencoded": {
                    /** @description Recipient email address */
                    to: string;
                };
                "multipart/form-data": {
                    /** @description Recipient email address */
                    to: string;
                };
            };
        };
        responses: {
            /** @description Response for status 201 */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        messageId?: string;
                    };
                };
            };
            /** @description Response for status 400 */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message?: string;
                        statusCode?: number;
                    };
                };
            };
            /** @description Response for status 401 */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message?: string;
                        statusCode?: number;
                    };
                };
            };
            /** @description Response for status 403 */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message?: string;
                        statusCode?: number;
                    };
                };
            };
            /** @description Response for status 429 */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message?: string;
                        statusCode?: number;
                    };
                };
            };
            /** @description Response for status 500 */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: string;
                        message?: string;
                        statusCode?: number;
                    };
                };
            };
        };
    };
    "webhooks.emailReceived": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** @description Webhook payload sent when an email is received */
        requestBody?: {
            content: {
                "application/json": {
                    email?: {
                        from?: {
                            addresses?: {
                                address?: string;
                                name?: string | null;
                            }[];
                            text?: string;
                        };
                        /** @example inbnd_abc123def456ghi */
                        id?: string;
                        /** @example <unique-id@sender.com> */
                        messageId?: string;
                        parsedData?: {
                            attachments?: {
                                contentType?: string;
                                downloadUrl?: string;
                                filename?: string;
                                size?: number;
                            }[];
                            htmlBody?: string | null;
                            textBody?: string | null;
                        };
                        /** @example support@yourdomain.com */
                        recipient?: string;
                        /** @example Help with my order */
                        subject?: string;
                        to?: {
                            addresses?: {
                                address?: string;
                                name?: string | null;
                            }[];
                            text?: string;
                        };
                    };
                    endpoint?: {
                        /** @example endp_xyz789 */
                        id?: string;
                        /** @example Support Webhook */
                        name?: string;
                        /** @example webhook */
                        type?: string;
                    };
                    /**
                     * @description The event type
                     * @example email.received
                     */
                    event?: string;
                    /**
                     * Format: date-time
                     * @example 2024-01-15T10:30:00Z
                     */
                    timestamp?: string;
                };
            };
        };
        responses: {
            /** @description Webhook processed successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
