import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "mailgun-inbound-alternative",
	title: "Mailgun Inbound Alternative: Routes to Replies",
	description:
		"Compare inbound with Mailgun for receiving email. Review routing, payloads, attachments, threaded replies, and a practical migration plan.",
	h1: "A Mailgun inbound alternative for receive-and-reply apps",
	intro:
		"Mailgun Routes and inbound both turn incoming email into application requests. Compare how you route messages, retrieve files, keep conversation state, and recover failed deliveries before moving a working integration.",
	sections: [
		{
			heading: "When Mailgun is the better fit",
			paragraphs: [
				"Stay with Mailgun when your application depends on its recipient or header expressions, regex matching, route priorities, or forward/store/stop actions. Keeping receiving beside an existing Mailgun API or SMTP sending integration can also reduce migration work.",
				"Consider inbound when the application needs address-level routing, a parsed JSON webhook, stored thread resources, and a reply endpoint in one workflow. Mailgun also supports JSON Route delivery, announced in September 2026; JSON alone is not a reason to switch.",
			],
		},
		{
			heading: "Compare the delivery and recovery contract",
			paragraphs: [
				"Mailgun delivers form data or multipart data by default, and JSON when the forwarding destination ends in json. Its current HTTP documentation describes Base64 attachment content inside that JSON payload. inbound sends parsed bodies and attachment metadata with authenticated download URLs.",
				"Mailgun documents temporary route storage for up to three days and HTTP delivery retries over eight hours, subject to response-code rules. inbound records delivery failures but does not retry automatically; use POST /api/e2/emails/:id/retry after fixing the endpoint. Build recovery into the migration, rather than carrying over assumptions about retries.",
				"inbound plans start at $4/month, with sending and receiving metered separately. Mailgun's route entitlements depend on the plan, including a route on its Free plan. How Mailgun bills receiving that only forwards to HTTP is described in their docs; an outbound sending allowance doesn't tell you how inbound is billed.",
			],
		},
		{
			heading: "Map routes and fields without assuming a drop-in swap",
			paragraphs: [
				"Turn a fixed-recipient Mailgun route into an inbound email address linked to an endpoint. Use a domain catch-all for unmatched addresses. Inventory header expressions, priorities, and stop actions separately: address routing is not a direct translation of Mailgun's rule language.",
				"Normalize both providers into your application's message model. Keep the SMTP envelope separate from visible To headers, and preserve original message headers for existing conversations.",
			],
			bullets: [
				"Recipient: Mailgun recipient maps to the routed address, email.recipient. Use inbound's email.envelopeRecipients for the full envelope-recipient list; email.to represents message-header recipients.",
				"Body: map body-plain to email.parsedData.textBody. Normalize Mailgun's body-html MIME parts for your application before comparing them with email.parsedData.htmlBody.",
				"Headers and replies: adapt message-headers to your internal header model. inbound exposes email.parsedData.inReplyTo and references, plus email.threadId; retain your existing conversation IDs alongside these values.",
				"Attachments: replace multipart-file or JSON Base64 handling with downloads from email.parsedData.attachments[].downloadUrl, using Authorization: Bearer <API key>.",
				"Reply extraction: Mailgun's stripped fields can be absent. inbound's cleanedContent.text is the parsed text body, not a guaranteed equivalent of stripped-text; retain any reply-extraction logic you need.",
			],
		},
		{
			heading: "Rehearse on a subdomain, then cut over",
			paragraphs: [
				"Run inbound on a separate receiving subdomain while Mailgun handles the current hostname. Parallel rehearsal means separate test destinations or controlled message copies; publishing both providers' MX records does not mirror delivery to both.",
			],
			bullets: [
				"1. Save the current MX records, route expressions, destinations, and application adapter. Add a test subdomain to inbound and publish the DNS records it returns.",
				"2. Send equivalent test conversations to both paths. Include an HTML-only message, a reply, multiple recipients, and attachments; compare normalized records and downloaded file contents.",
				"3. Exercise a failed inbound webhook and manual retry. Verify the X-Webhook-Verification-Token header and deduplicate processing using the message ID and intended application action.",
				"4. After the rehearsal passes, configure the production receiving subdomain in inbound and replace that hostname's MX records with inbound's supplied values. Keep Mailgun's route and handler available while DNS caches expire, and allow only one path to send production replies.",
				"5. To roll back, restore the saved MX records and Mailgun adapter. Continue accepting delayed deliveries on both handlers, reconcile messages already received by inbound, and prevent duplicate actions before replaying anything.",
			],
		},
	],
	comparison: {
		competitor: "Mailgun",
		rows: [
			{
				label: "Receiving model",
				inbound:
					"Domain and address routing to application endpoints; received messages available through the API.",
				other:
					"Routes with matching expressions and forward, store, and stop actions.",
			},
			{
				label: "Payload format",
				inbound:
					"JSON email.received event with parsed text and HTML in email.parsedData.",
				other:
					"Form/multipart by default; opt-in JSON delivery for destinations ending in json.",
			},
			{
				label: "Attachments",
				inbound: "Metadata and API-key-authenticated download URLs.",
				other:
					"Multipart files, or Base64 content in the JSON attachments array.",
			},
			{
				label: "Threading and replies",
				inbound:
					"Thread list/get APIs and reply by email or thread ID; reply headers set for you.",
				other:
					"Route payload includes headers; the reviewed workflow leaves conversation mapping to the application.",
			},
			{
				label: "Custom domains and routing",
				inbound:
					"Custom MX domains, individual address endpoints, and domain catch-all.",
				other:
					"Custom MX domains, recipient/header matching, regex, priorities, and catch-all rules.",
			},
			{
				label: "Sending",
				inbound: "Send API plus a dedicated reply endpoint.",
				other: "API and SMTP sending.",
			},
			{
				label: "How pricing works",
				inbound:
					"Plans start at $4/month; separate sent and received allowances. See pricing for current terms.",
				other:
					"Route entitlements vary by plan. Exact HTTP-only receiving metering: see their docs.",
			},
			{
				label: "Failed webhook delivery",
				inbound: "Recorded failures; manual retry API. No automatic retries.",
				other:
					"Documented HTTP retries over eight hours, with response-code exceptions.",
			},
		],
		note: "Compared using public documentation as of September 2026. Check Mailgun's current Routes and HTTP payload docs before migrating: https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/routes and https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/receive-http. Check current plan entitlements at https://www.mailgun.com/pricing/.",
	},
	faqs: [
		{
			question: "Can I receive email rather than forward it using Mailgun?",
			answer:
				"Yes. A Mailgun route can send a parsed message to an HTTP endpoint, and routes also support temporary storage. Forwarding to HTTP is application ingestion, not just forwarding to another mailbox. inbound offers an address-to-webhook workflow with message and thread APIs.",
		},
		{
			question: "Why can't I receive an email with an attachment from Mailgun?",
			answer:
				"Check the route destination and the request's Content-Type first. Default routes with attachments use multipart/form-data; JSON destinations carry Base64 attachment content. A handler expecting only URL-encoded fields can miss uploaded files. Inspect the delivery response and your server's request-size limit before changing providers.",
		},
		{
			question: "Can I strip attachments before Mailgun POSTs the email?",
			answer:
				"See their docs for the currently supported route and storage options; do not assume a route removes attachment bytes. inbound provides authenticated attachment download URLs, so application workers can retrieve files separately. Its raw MIME can still include attachment content; inbound does not promise an attachment-free webhook body.",
		},
	],
	related: ["email-webhook-api", "email-parsing-api", "catch-all-email-api"],
	updated: "2026-09-30",
};
