import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "postmark-inbound-alternative",
	title: "Postmark Inbound Alternative for Email Replies",
	description:
		"Compare inbound and Postmark for incoming email, parsed replies, attachments, and threading. Plan a migration around your actual email workflow.",
	h1: "A Postmark inbound alternative for threaded workflows",
	intro:
		"Postmark and inbound both deliver parsed email as JSON. The useful comparison is how your application maps a reply to a conversation, handles attachment bytes, and sends the next message.",
	sections: [
		{
			heading: "When Postmark is the better fit",
			paragraphs: [
				"Postmark can be the better fit when you already use its transactional API or SMTP sending and route comments or tickets through MailboxHash and plus-addressing. Its JSON webhook includes text, HTML, headers, Base64 attachments, and StrippedTextReply when reply extraction succeeds.",
				"Consider inbound when you want custom-domain address routing, thread list/get APIs, and replies by email or thread ID. Your application's ticket IDs still matter: switching providers does not automatically translate an existing ticket database into inbound threads.",
			],
		},
		{
			heading: "Compare reply extraction, retention, and pricing",
			paragraphs: [
				"A cleaned reply and a stored conversation solve different problems. Postmark's StrippedTextReply attempts to isolate the new reply; MailboxHash helps your application locate a ticket. inbound exposes threadId and parsed reply headers, while cleanedContent.text remains the parsed text body. Do not substitute it for a latest-reply extractor.",
				"Postmark documents one inbound stream per server and default message retention of 45 days, with extended retention available as an add-on. Confirm inbound's current retention terms before moving an archive-dependent workflow; this comparison does not promise matching storage duration.",
				"inbound plans start at $4/month with separate sending and receiving allowances. Postmark counts sending and receiving toward shared volume; its paid inbound entry is Pro, not Basic. See pricing for current terms rather than comparing sending-only allowances.",
				"Postmark documents a 35 MB cumulative inbound attachment limit and a 10 MB outbound message limit. Test receive-and-reply attachments against both directions. For inbound, verify your receiving requirements in the docs instead of assuming outbound limits also describe receiving.",
			],
		},
		{
			heading: "Preserve your conversation mapping while adapting fields",
			paragraphs: [
				"Keep the existing application conversation ID as the stable key during migration. Store provider IDs separately, and associate newly received inbound email.id and email.threadId values with that conversation after checking recipients and reply headers.",
			],
			bullets: [
				"Body fields: Postmark TextBody and HtmlBody become email.parsedData.textBody and email.parsedData.htmlBody. Retain any application-level quoted-reply cleanup.",
				"Recipients: compare Postmark OriginalRecipient with inbound email.recipient and email.envelopeRecipients. Keep ToFull/header recipients separate from envelope routing; do not construct routing solely from visible To text.",
				"Ticket identity: MailboxHash has no claimed automatic equivalent here. Preserve the hash-to-ticket lookup and explicitly parse or map your inbound recipient aliases; do not replace a ticket ID with a thread ID.",
				"Message identity: keep Postmark MessageID as a provider ID. Preserve the RFC Message-ID from headers separately and compare it with inbound email.messageId when matching historical conversations.",
				"Files: replace decoding Attachments[].Content with downloads from email.parsedData.attachments[].downloadUrl using Authorization: Bearer <API key>. Validate the downloaded files before passing them to the existing worker.",
			],
		},
		{
			heading: "Rehearse complete conversations before moving MX",
			paragraphs: [
				"Run Postmark and inbound in parallel on separate receiving subdomains, using controlled test conversations. A replay of a saved webhook checks the adapter; a real email exchange checks routing and reply headers. Use both before switching production traffic.",
			],
			bullets: [
				"1. Save the current Postmark inbound address or forwarding-domain configuration, MX records, and hash-to-ticket mapping. Add an inbound test subdomain and publish its supplied DNS records.",
				"2. Replay representative Postmark JSON into the old adapter, then send equivalent new conversations through inbound. Check ticket selection, multiple reply turns, quoted text, inline images, and downloaded attachments.",
				"3. Verify inbound's X-Webhook-Verification-Token and exercise POST /api/e2/emails/:id/retry after a failed delivery. Failed inbound webhooks are not retried automatically. Deduplicate application actions before enabling replies.",
				"4. Configure the production receiving subdomain in inbound, then replace that hostname's MX records. If a forwarding configuration is involved, update that destination as well. Keep the old handler active for delayed mail and retain the application's historical conversation mapping.",
				"5. Roll back by restoring the saved MX and forwarding configuration and the Postmark adapter. Reconcile any messages accepted by inbound during the cutover; restoring DNS does not transfer them back.",
			],
		},
	],
	comparison: {
		competitor: "Postmark",
		rows: [
			{
				label: "Receiving model",
				inbound:
					"Domain/address endpoints with API access to received mail and threads.",
				other:
					"Inbound address or inbound forwarding domain; one inbound stream per server.",
			},
			{
				label: "Payload format",
				inbound:
					"JSON with parsed text, HTML, headers, and thread information.",
				other:
					"JSON with TextBody, HtmlBody, headers, and StrippedTextReply when available.",
			},
			{
				label: "Attachments",
				inbound: "Metadata and API-key-authenticated download URLs.",
				other: "Base64 content included in the JSON webhook.",
			},
			{
				label: "Threading and replies",
				inbound:
					"Stored thread resources and reply endpoint with In-Reply-To and References handled.",
				other:
					"MailboxHash, plus-addressing, and headers support application-managed conversation mapping.",
			},
			{
				label: "Custom domains and routing",
				inbound:
					"Custom MX domains, individual address routes, and catch-all endpoints.",
				other:
					"Custom inbound domain forwarding and plus-addressing for application routing.",
			},
			{
				label: "Sending",
				inbound: "Send API and replies by email or thread ID.",
				other: "Transactional API and SMTP sending.",
			},
			{
				label: "How pricing works",
				inbound:
					"Plans start at $4/month; separate sent and received allowances. See pricing.",
				other:
					"Sending and receiving share message volume. Paid inbound is on Pro, not Basic; check current pricing.",
			},
			{
				label: "Retention",
				inbound:
					"Confirm current retention terms in the docs before migrating stored-history workflows.",
				other:
					"45-day default message retention; extended retention is an add-on.",
			},
		],
		note: "Compared using public documentation as of September 2026. Check Postmark's current inbound docs at https://postmarkapp.com/developer/user-guide/inbound and payload reference at https://postmarkapp.com/developer/webhooks/inbound-webhook. Plan and retention terms: https://postmarkapp.com/pricing. Size limits: https://postmarkapp.com/support/article/1056-what-are-the-attachment-and-email-size-limits.",
	},
	faqs: [
		{
			question: "Can I use Postmark to create threaded replies?",
			answer:
				"Yes, applications can use message headers and their own conversation mapping when sending replies. Postmark's documented inbound workflow uses MailboxHash and plus-addressing to associate messages with application records. inbound additionally offers thread resources and a reply endpoint that sets In-Reply-To and References for you.",
		},
		{
			question: "How do I clean a parsed Postmark email?",
			answer:
				"Use StrippedTextReply when available, but keep a fallback to the full body and test the mail clients your users use. Reply extraction has limitations. inbound's cleanedContent provides sanitized HTML and parsed text; it does not guarantee that quoted conversation history has been removed.",
		},
		{
			question: "How can I get data from a user's email reply?",
			answer:
				"First resolve the reply to an application record using your recipient alias or ticket mapping and message headers. Then process the parsed body and attachments. In inbound, use email.envelopeRecipients, email.parsedData, and thread information; extracting business fields from prose or documents remains application work.",
		},
	],
	related: [
		"email-parsing-api",
		"email-api-for-ai-agents",
		"catch-all-email-api",
	],
	updated: "2026-09-30",
};
