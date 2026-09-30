import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "resend-inbound-alternative",
	title: "Resend Inbound vs inbound: Receiving Email APIs",
	description:
		"Compare Resend Inbound and inbound for email receiving, webhook payloads, attachments, and threaded replies. Find the right workflow for your app.",
	h1: "Resend Inbound vs inbound for receiving and replying",
	intro:
		"Resend has supported receiving since November 2025. Both services receive and send email; the distinction is the workflow. Resend notifies your app, then lets it fetch content. inbound includes parsed bodies in the receiving webhook and exposes thread and reply APIs.",
	sections: [
		{
			heading: "When Resend is the better fit",
			paragraphs: [
				"Resend can be the better fit if you already use its sending API and want to add receiving in the same integration. Its metadata-first webhook intentionally supports serverless request-size constraints by leaving body, headers, and attachment bytes to follow-up requests.",
				"Consider inbound if your worker needs the parsed text or HTML immediately from the webhook, and you want address routing, stored thread resources, and replies by email or thread ID. File bytes still require download handling; a body-in-webhook design does not eliminate all follow-up requests.",
			],
		},
		{
			heading: "Compare the actual receiving sequence",
			paragraphs: [
				"Resend's email.received event contains metadata. Use its Received emails API to fetch body and headers, and its attachments API to obtain download URLs. Missing inline body content is part of this documented contract, not evidence of a failed receipt.",
				"inbound's email.received event includes email.parsedData.textBody and htmlBody alongside headers and attachment metadata. Download files through their authenticated downloadUrl values. The raw MIME field may include attachment content, so measure actual request sizes rather than assuming a JSON webhook is always small.",
			],
			code: {
				label: "Delivery sequence, before your application's processing step",
				snippet: `Resend
  email.received metadata event
  -> Received emails API: text, HTML, headers
  -> Attachments API: download URLs
  -> download files needed by the worker

inbound
  email.received event
  -> email.envelopeRecipients: routing recipients
  -> email.parsedData: text, HTML, attachment metadata
  -> authenticated downloadUrl requests for needed files`,
			},
		},
		{
			heading: "Keep thread state, routing, and storage explicit",
			paragraphs: [
				"Resend supports receiving on a provided domain or a custom-domain catch-all. The reviewed receiving docs do not establish a native thread resource; use their current docs for any newer capability. Keep your application conversation mapping and reply-header logic explicit when evaluating the migration.",
				"inbound supports individual address endpoints and catch-all routing. Its thread APIs retrieve conversation context, and POST /api/e2/emails/:id/reply sets In-Reply-To and References. Keep your application's conversation ID alongside inbound's IDs rather than assuming historical conversations are imported automatically.",
				"Resend documents 30-day email retention on Free, Pro, and Scale, with sending and receiving counted toward combined quotas. inbound plans start at $4/month and meter sending and receiving separately. Check current pricing, domain allowances, and retention requirements for your workload; entry price alone does not determine the total bill.",
			],
		},
		{
			heading: "Port one handler and rehearse a reversible cutover",
			paragraphs: [
				"Map the text and html returned by Resend's Received emails API to inbound's email.parsedData.textBody and htmlBody. Use email.envelopeRecipients for inbound routing, and adapt headers and attachment metadata into your existing message model. Keep Resend provider IDs separate from inbound email.id and RFC message identifiers.",
			],
			bullets: [
				"1. Save the current receiving-domain configuration, MX records, and Resend handler. Add a separate inbound test subdomain with its supplied DNS records so both integrations can run in parallel.",
				"2. Send equivalent conversations to each test path. Check recipient routing, a complete reply exchange, missing text or HTML, inline images, and downloaded attachment contents. Do not publish two providers' MX records expecting mirrored delivery.",
				"3. Replace Resend's body-fetch step with reading email.parsedData. Verify X-Webhook-Verification-Token and fetch inbound attachment URLs with Authorization: Bearer <API key>. Persist before acknowledgment and test application deduplication.",
				"4. Exercise a failed inbound webhook and POST /api/e2/emails/:id/retry; inbound does not retry automatically. After checks pass, configure the production receiving subdomain in inbound and replace its MX records, keeping both handlers available while DNS caches expire.",
				"5. If you need to roll back, restore the saved MX records and Resend handler. Keep only one production reply path enabled and reconcile mail already received by inbound before replaying any application actions.",
			],
		},
	],
	comparison: {
		competitor: "Resend",
		rows: [
			{
				label: "Receiving model",
				inbound:
					"Domain/address routing with parsed-message webhook delivery and message APIs.",
				other:
					"Receiving domains, metadata events, and APIs to retrieve received content.",
			},
			{
				label: "Payload format",
				inbound: "JSON containing parsed text and HTML in email.parsedData.",
				other:
					"JSON metadata webhook; fetch body and headers from the Received emails API.",
			},
			{
				label: "Attachments",
				inbound:
					"Metadata and API-key-authenticated download URLs in the webhook.",
				other:
					"Attachment metadata in events; attachments API provides temporary download URLs.",
			},
			{
				label: "Threading and replies",
				inbound:
					"Thread list/get APIs and reply endpoint that sets reply headers.",
				other:
					"Use headers and application conversation state. Native thread-resource availability: see their docs.",
			},
			{
				label: "Custom domains and routing",
				inbound:
					"Custom MX domains, individual address endpoints, and catch-all routing.",
				other: "Provided receiving domain or custom-domain catch-all.",
			},
			{
				label: "Sending",
				inbound: "Send API and dedicated replies by email or thread ID.",
				other: "Sending and forwarding APIs.",
			},
			{
				label: "How pricing works",
				inbound:
					"Plans start at $4/month; separate sent and received allowances. See pricing.",
				other:
					"Sent and received email share the quota; free-plan daily limits also apply to receiving.",
			},
			{
				label: "Retention",
				inbound:
					"Confirm current retention terms in the docs for your storage requirements.",
				other: "30-day email retention documented for Free, Pro, and Scale.",
			},
		],
		note: "Compared using public documentation as of September 2026. Check Resend's current receiving docs at https://resend.com/docs/dashboard/receiving/introduction, body-fetch contract at https://resend.com/docs/dashboard/receiving/get-email-content, and attachment workflow at https://resend.com/docs/dashboard/receiving/attachments. Current quotas and retention: https://resend.com/docs/knowledge-base/resend-sending-limits. Pricing: https://resend.com/pricing.",
	},
	faqs: [
		{
			question: "Why is the Resend webhook missing the email body?",
			answer:
				"Resend intentionally sends metadata rather than body, headers, or attachment bytes in the event. Fetch content through its Received emails API using the received email ID. inbound instead includes parsed text and HTML in email.parsedData; both contracts require your handler to use the correct fields.",
		},
		{
			question: "How do I keep replies in the same email thread?",
			answer:
				"Preserve the original message identifiers and reply-header chain when maintaining application-owned conversations. inbound's reply endpoint accepts an email or thread ID and sets In-Reply-To and References. Test real reply exchanges in the mail clients you support; a matching subject alone is not a conversation mapping strategy.",
		},
		{
			question: "What happens if I already have MX records for my domain?",
			answer:
				"Use a dedicated receiving subdomain for the rehearsal so your existing domain keeps its mail destination. After testing, replace MX records only for the hostname you intend to move. Keep a saved copy for rollback and leave both handlers available during DNS propagation; multiple MX providers do not create duplicate deliveries by design.",
		},
	],
	related: [
		"email-webhook-api",
		"email-api-for-ai-agents",
		"guides/receive-email-nextjs",
	],
	updated: "2026-09-30",
};
