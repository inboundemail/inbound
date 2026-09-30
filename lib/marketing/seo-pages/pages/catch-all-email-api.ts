import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "catch-all-email-api",
	title: "Catch-All Email API for Custom Domains",
	description:
		"Route email from any address on your domain to webhooks. Set up catch-all handling, dedicated routes, and per-customer email workflows.",
	h1: "Receive and route email from any address on your domain",
	intro:
		"Use a catch-all email API to receive customer aliases through one domain-level route, while keeping dedicated routes for specific addresses. This is receiving and application routing, not a service for verifying whether someone else's catch-all address exists.",
	sections: [
		{
			heading: "One receiving domain, customer aliases, and dedicated routes",
			paragraphs: [
				"Suppose your application assigns customer-42@receive.example.com and customer-73@receive.example.com to two customers. Enable catch-all on receive.example.com and point it at a webhook endpoint. Your handler maps each incoming alias to the correct customer.",
				"Create a specific route for billing@receive.example.com when billing needs a different endpoint. Under normal address routing, its active dedicated endpoint takes precedence over the domain catch-all. Addresses without a matching dedicated route use the catch-all fallback.",
				"Manage specific routes through /api/e2/email-addresses and catch-all settings through PATCH /api/e2/domains/:id. Plans start at $4/month; see the pricing page for current details and the docs for request fields.",
			],
			code: {
				label: "Example routing configuration for receive.example.com",
				snippet: `billing@receive.example.com     → dedicated billing endpoint
customer-42@receive.example.com → catch-all → customer 42
customer-73@receive.example.com → catch-all → customer 73
unknown@receive.example.com     → catch-all → application review`,
			},
		},
		{
			heading: "Set MX records on a receiving subdomain",
			paragraphs: [
				"Add receive.example.com to inbound and copy the DNS records returned for that domain. Publish its receiving MX record at the receive.example.com hostname, then verify the domain and configure an endpoint. Use the generated record values rather than guessing a mail-server hostname.",
				"Keep the existing MX records for example.com with your current mail provider. MX routing applies to the domain after the @ sign, so mail to person@example.com and customer-42@receive.example.com can go to different providers.",
				"Adding inbound as another MX on the same hostname does not split delivery by local part. Senders choose mail servers by MX priority and availability, not by customer alias. A separate receiving subdomain gives the application its own mail route.",
			],
		},
		{
			heading: "Routing precedence and the actual recipient",
			paragraphs: [
				"Normal address lookup checks an active, account-owned address first. It uses that address's active endpoint; if the address has a legacy webhook configuration instead, lookup hands off to legacy processing before considering catch-all. Otherwise, it checks the matching domain's enabled catch-all for an active endpoint, then its legacy webhook fallback.",
				"An address record without a usable endpoint can fall through to catch-all. If neither an endpoint nor a legacy webhook resolves, an already received message is stored without endpoint delivery. This is a routing outcome, not a promise that an unknown address will produce an SMTP bounce.",
				"Guard rules are evaluated before normal routing and can block or redirect delivery. Existing thread replies can also follow the original thread's endpoint before address lookup. Test a new conversation when checking dedicated-route versus catch-all precedence.",
				"In the webhook payload, email.recipient identifies the recipient used for that endpoint delivery. email.envelopeRecipients contains the SMTP envelope recipients, including BCC recipients, which may not appear in the visible To or CC headers. Normal routing resolves envelope recipients and sends one delivery per distinct endpoint.",
				"Map only recognized envelope addresses to tenants you own, and keep recipient details private to the appropriate tenant. Do not treat an arbitrary catch-all alias or the visible To header as authorization. Unknown aliases can reach your catch-all handler, so decide whether to store, review, or ignore them in your application.",
			],
		},
		{
			heading: "Choose HTTP delivery or email forwarding",
			paragraphs: [
				"A webhook endpoint sends parsed email as an HTTP JSON request to your application. An email endpoint forwards to one email address; an email_group endpoint forwards to a group of up to 50 recipients. Choose HTTP when software needs to process the message, or email forwarding when a person needs it in an existing mailbox.",
				"DNS gets a message to inbound; address and catch-all settings decide its next destination. If delivery fails, check those two stages separately. Webhook failures are recorded and are not retried automatically; POST /api/e2/emails/:id/retry provides a manual retry after you fix the endpoint.",
			],
			code: {
				label: "DNS and routing troubleshooting",
				snippet: `Symptom                    | Check
Mail goes to old provider   | MX on the exact domain after @
Receiving domain unverified| Generated DNS records and live verification
One address goes elsewhere | Dedicated route, Guard, thread continuity
Unknown aliases not routed | Catch-all enabled and endpoint active
Message stored, no webhook | Route configuration and delivery result
Wildcard DNS has no effect | Catch-all settings for the exact domain`,
			},
		},
	],
	faqs: [
		{
			question: "How can I give each user a unique address to send to?",
			answer:
				"Assign a unique local part, such as customer-42, on your receiving domain. With catch-all enabled, your application can recognize those aliases without creating an individual address route for each one. Keep the alias-to-user map in your own database and validate it when a message arrives.",
		},
		{
			question: "What happens if I already have MX records for my domain?",
			answer:
				"Use a receiving subdomain such as receive.example.com and publish inbound's MX there. Leave the parent domain's mail records with your existing provider. Replacing the parent's MX changes where mail for that parent domain is delivered; multiple providers' MX records do not create per-address routing.",
		},
		{
			question: "Is wildcard DNS the same as catch-all email routing?",
			answer:
				"No. Wildcard DNS covers matching hostnames, such as subdomains under example.com. Catch-all email routing covers otherwise unmatched local parts before @ on a configured domain, such as any-name@receive.example.com. A wildcard DNS record does not enable inbound catch-all, and enabling catch-all does not configure arbitrary receiving subdomains.",
		},
		{
			question:
				"Will a dedicated route also deliver to the catch-all endpoint?",
			answer:
				"For the same recipient under normal address routing, the active dedicated endpoint wins; catch-all is a fallback, not an extra copy. A message with several envelope recipients can resolve to different endpoints, with one delivery per distinct endpoint. Guard routing and thread continuity may select an endpoint before normal address lookup.",
		},
		{
			question: "Can I route an email sent using BCC?",
			answer:
				"Use email.envelopeRecipients in the webhook payload, which includes BCC envelope recipients received by inbound. Do not rely on the visible To header or expect a BCC header to survive delivery. Apply your tenant mapping to the envelope addresses without exposing other recipients to customers.",
		},
	],
	related: [
		"inbound-email-service",
		"email-webhook-api",
		"email-api-for-ai-agents",
	],
	updated: "2026-09-30",
};
