import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "sendgrid-inbound-alternative",
	title: "SendGrid Inbound Parse Alternative",
	description:
		"Compare inbound with SendGrid Inbound Parse. See payload differences, attachment handling, threaded replies, and a step-by-step migration path.",
	h1: "A SendGrid Inbound Parse alternative with JSON webhooks",
	intro:
		"SendGrid Inbound Parse posts parsed email as multipart form data. inbound posts a JSON event with parsed bodies, attachment download URLs, and thread information. The migration changes your receiving handler, routing, and recovery process.",
	sections: [
		{
			heading: "When SendGrid is the better fit",
			paragraphs: [
				"SendGrid can be the better fit when your application already uses its API or SMTP sending infrastructure and has a working multipart receiving handler. Keeping your existing conversation model and attachment pipeline may be simpler than migrating them.",
				"Consider inbound if you want parsed email in JSON, address-level webhook routing, and thread retrieval with a dedicated reply endpoint. This comparison concerns receiving and reply workflows, not a claim about outbound delivery performance.",
			],
		},
		{
			heading: "Account for authentication, retries, and message size",
			paragraphs: [
				"SendGrid requires an authenticated receiving domain and a unique receiving hostname. Its documented total message limit is 30 MB, including attachments. Verify your own web server's request-size limits too: accepting the email and accepting the resulting multipart request are different steps.",
				"SendGrid retries failed Parse delivery for up to three days, then drops undeliverable messages without prior notification. inbound records failures but does not retry automatically; recovery uses POST /api/e2/emails/:id/retry. Persist accepted messages before acknowledging delivery and make application actions idempotent.",
				"Use each provider's own request-verification procedure. For inbound, compare X-Webhook-Verification-Token with your endpoint's configured token. For SendGrid's current Inbound Parse security options, see their docs; do not reuse verification code intended for outbound delivery events.",
				"inbound plans start at $9/month. SendGrid lists Inbound Parse in its Email API plan comparison, but a separate per-inbound-message rate was not established in the reviewed pricing. Check current pricing and quotas instead of assuming an extra inbound add-on charge.",
			],
		},
		{
			heading: "Replace the multipart adapter and file pipeline",
			paragraphs: [
				"Map SendGrid's JSON-encoded envelope.to field to inbound's email.envelopeRecipients, not email.to. Map text and html to email.parsedData.textBody and htmlBody. The small adapters below produce the same application shape after provider-specific request verification and parsing.",
				"SendGrid supplies attachment files in multipart fields, with attachment-info describing them. With inbound, enqueue work using email.parsedData.attachments and download each file through its downloadUrl with Authorization: Bearer <API key>. Compare downloaded bytes and filenames in your rehearsal rather than treating metadata as file content.",
			],
			code: {
				label:
					"JavaScript field adapters: parsed SendGrid FormData versus inbound JSON",
				snippet: `function fromSendGrid(form) {
  const envelope = JSON.parse(String(form.get("envelope")));
  return {
    recipients: envelope.to,
    text: form.get("text") || "",
    html: form.get("html") || "",
  };
}

function fromInbound(event) {
  const { email } = event;
  return {
    recipients: email.envelopeRecipients,
    text: email.parsedData.textBody || "",
    html: email.parsedData.htmlBody || "",
  };
}`,
			},
		},
		{
			heading: "Move a receiving hostname with a rollback path",
			paragraphs: [
				"Use a separate test subdomain to run both integrations in parallel. Do not add competing MX records expecting each provider to receive a copy; use controlled test messages for the parallel comparison.",
			],
			bullets: [
				"1. Save SendGrid's current hostname, webhook settings, MX records, and adapter. Configure an inbound test subdomain with the returned DNS records and an address or catch-all endpoint.",
				"2. Send representative messages to both integrations, including HTML, multiple recipients, inline images, and files. Test inbound token verification, a failed webhook, and manual retry.",
				"3. Preserve RFC Message-ID values from SendGrid's headers and inbound's email.messageId alongside provider-specific IDs. Use a message-and-action deduplication key, and enable automated replies on only one production path.",
				"4. After acceptance checks pass, configure the existing receiving subdomain in inbound and replace its MX records with inbound's supplied records. Keep both handlers running for mail arriving through cached DNS.",
				"5. Roll back by restoring the saved MX records and SendGrid adapter. Reconcile messages received during the transition before replaying jobs; DNS rollback does not move messages already accepted by inbound.",
			],
		},
	],
	comparison: {
		competitor: "SendGrid Inbound Parse",
		rows: [
			{
				label: "Receiving model",
				inbound:
					"Receive on your domain, route to an endpoint, and access messages through the API.",
				other:
					"Receive on a configured hostname and POST parsed mail to its destination URL.",
			},
			{
				label: "Payload format",
				inbound: "JSON email.received event with bodies in email.parsedData.",
				other:
					"Multipart/form-data with parsed text, HTML, and headers; optional raw MIME mode.",
			},
			{
				label: "Attachments",
				inbound: "Attachment metadata and authenticated download URLs.",
				other:
					"Files in the multipart request and attachment-info metadata; 30 MB total message limit.",
			},
			{
				label: "Threading and replies",
				inbound:
					"Thread resources and reply by email or thread ID, with reply headers handled.",
				other:
					"Parsed headers support application-owned conversation mapping and reply logic.",
			},
			{
				label: "Custom domains and routing",
				inbound:
					"Custom MX domains, individual address endpoints, and catch-all routing.",
				other:
					"Authenticated receiving domain and unique hostname mapped to a Parse webhook URL.",
			},
			{
				label: "Sending",
				inbound: "Send API and dedicated reply endpoint.",
				other: "SendGrid API and SMTP sending.",
			},
			{
				label: "How pricing works",
				inbound:
					"Plans start at $9/month; sending and receiving have separate allowances. See pricing.",
				other:
					"Inbound Parse is listed in Email API plans. Separate inbound rates and quotas: see their docs.",
			},
			{
				label: "Failed webhook delivery",
				inbound:
					"Recorded failures and manual retry API; no automatic retries.",
				other:
					"Retries for up to three days; undeliverable messages are then dropped without prior notification.",
			},
		],
		note: "Compared using public documentation as of September 2026. Check SendGrid's current payload and setup docs at https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook and delivery constraints at https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/inbound-email. Current pricing: https://www.twilio.com/en-us/products/email-api/pricing.",
	},
	faqs: [
		{
			question: "How do I retrieve attachments from SendGrid Inbound Parse?",
			answer:
				"In the default parsed mode, use a multipart parser to read the uploaded file fields and attachment-info metadata. Reading only ordinary form fields can omit the files. When moving to inbound, change that pipeline to read email.parsedData.attachments and fetch the authenticated download URLs.",
		},
		{
			question:
				"How do I separate attachments from a raw MIME message from SendGrid?",
			answer:
				"If raw full MIME mode is enabled, use a MIME parser on the email field to extract parts and files. Alternatively, use SendGrid's parsed mode and handle multipart uploads. inbound already provides parsed bodies and attachment metadata for messages it receives; it is not presented here as an arbitrary MIME-upload parser.",
		},
		{
			question:
				"How can I parse incoming email and POST the data to an endpoint?",
			answer:
				"Both services support that workflow. Configure the receiving hostname and MX records, set the webhook destination, then send a real message. For inbound, add an address route or domain catch-all, verify the token header, persist the JSON event, and process it through your application worker.",
		},
	],
	related: [
		"email-webhook-api",
		"email-parsing-api",
		"guides/receive-email-nextjs",
	],
	updated: "2026-09-30",
};
