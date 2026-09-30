import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "inbound-email-service",
	title: "Inbound Email API: Receive and Reply",
	description:
		"Receive email as structured JSON, handle attachments, and reply in thread. Connect your domain and build email workflows with inbound.",
	h1: "An inbound email API for receiving and replying",
	intro:
		"inbound receives email on your domain, sends each message to your application as JSON, and lets you reply in the same thread through one REST API. Sending, receiving and replies share one account, one API key and one set of domains.",
	sections: [
		{
			heading: "One workflow: receive a request, reply in thread",
			paragraphs: [
				"A customer writes to support@yourdomain.com. inbound receives the message, parses it, and POSTs it to your webhook with the sender, subject, text and HTML bodies, attachments with download links, and a thread ID.",
				"Your application decides what to do: open a ticket, run an agent, or store the message. When you are ready to answer, you reply by email ID or thread ID. inbound sets the In-Reply-To and References headers so the reply lands in the customer's existing conversation.",
			],
			code: {
				label: "Reply to a received email (REST, inside your handler)",
				snippet: `const { email } = await request.json();

await fetch(\`https://inbound.new/api/e2/emails/\${email.id}/reply\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.INBOUND_API_KEY}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": \`ack-\${email.id}\`,
  },
  body: JSON.stringify({
    from: "support@yourdomain.com",
    text: "Thanks, we have your request and will follow up shortly.",
  }),
});`,
			},
		},
		{
			heading: "Set up a domain and receive your first message",
			paragraphs: [
				"Setup takes a few API calls or a few clicks in the dashboard. You can use a subdomain such as mail.yourdomain.com if your main domain already receives mail elsewhere.",
			],
			bullets: [
				"Add the domain. inbound returns the DNS records to create: MX, a verification TXT record, DKIM, SPF and a suggested DMARC record.",
				"Create the records. inbound checks pending domains every 5 minutes, or you can trigger a check yourself.",
				"Create a webhook endpoint with your HTTPS URL.",
				"Route an address to that endpoint, or turn on catch-all to route every address on the domain.",
				"Send a real email to the address and watch the delivery appear in your logs.",
			],
		},
		{
			heading: "What you get, and the limits to plan around",
			paragraphs: [
				"Each received message arrives as one JSON POST with the event email.received. The payload includes parsed fields, the raw MIME source, sanitized HTML, thread information and authenticated attachment download URLs. The email parsing API page lists every field.",
				"These are the operational details worth knowing before you commit. Plans start at $4/month and include both sending and receiving volume; see the pricing page for current plans.",
			],
			bullets: [
				"Webhook requests carry an X-Webhook-Verification-Token header that you compare with your endpoint's token. It is a shared token, not an HMAC signature.",
				"Each endpoint has a timeout, 30 seconds by default. Any 2xx response counts as delivered.",
				"Failed deliveries are recorded but not retried automatically. You retry them with POST /api/e2/emails/:id/retry.",
				"When a payload exceeds 1 MB, attachment bodies are removed from the raw MIME field. Files stay available through their download URLs.",
				"The API allows 100 requests per second per account. The official SDK is TypeScript (npm package inboundemail); other languages use the REST API.",
			],
		},
		{
			heading: "Webhook routing, a managed inbox, or an existing mailbox",
			paragraphs: [
				"Receiving email usually takes one of three shapes. Pick the one that matches who owns the address and where the conversation lives.",
				"If you already send through another provider and only need email converted to HTTP, a receive-focused service such as CloudMailin can be a reasonable fit. inbound is most useful when you want receiving, sending and threaded replies in one place.",
			],
			bullets: [
				"Route to a webhook: your application owns the address and reacts to each message as it arrives. This is inbound's main model.",
				"Managed inbox: inbound stores received mail. You can list it with GET /api/e2/emails, read conversations with the threads endpoints, or connect a mail client over IMAP.",
				"Existing mailbox: if you need to read a person's current Gmail or Outlook inbox, use that provider's API or IMAP. inbound does not connect to third-party mailboxes.",
				"Forwarding: an endpoint can also forward messages to one email address or a group of up to 50 recipients instead of calling a webhook.",
			],
		},
	],
	faqs: [
		{
			question: "Is an inbound email API the same as email to webhook?",
			answer:
				"Email to webhook is one part of it. inbound turns each received message into a JSON webhook, and also stores the message, groups it into threads and lets you reply through the API. If you only need the webhook, you can ignore the rest.",
		},
		{
			question: "Do I need a webhook, or can I poll for new email?",
			answer:
				"Webhooks are the main delivery method, but you can also poll. GET /api/e2/emails with type=received lists received messages, and GET /api/e2/mail/threads lists conversations. IMAP access is available as well. An address with no endpoint still stores its mail.",
		},
		{
			question: "Do you support attachments?",
			answer:
				"Yes. Each attachment in the webhook payload includes its filename, content type, size and a downloadUrl. You download the file from that URL with your API key. You can also attach files when sending or replying, up to 25 MB per file and 40 MB per email.",
		},
		{
			question: "Can I use my own domain?",
			answer:
				"Yes, receiving always uses a domain you own, or a subdomain of it. You add MX and verification records, and a subdomain inherits verification from a verified parent domain.",
		},
		{
			question: "What happens if my webhook is down?",
			answer:
				"The delivery is recorded as failed with the response code or error. inbound does not retry it automatically. Once your endpoint is healthy, retry the delivery from the dashboard or with POST /api/e2/emails/:id/retry.",
		},
	],
	related: [
		"email-webhook-api",
		"email-parsing-api",
		"email-api-for-ai-agents",
		"catch-all-email-api",
	],
	updated: "2026-09-30",
};
