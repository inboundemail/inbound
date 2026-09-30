import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "email-webhook-api",
	title: "Email to Webhook: Receive JSON Events",
	description:
		"Turn incoming email into JSON webhooks. Verify each request, acknowledge fast, avoid duplicate work, and replay failed deliveries.",
	h1: "Receive incoming email as a JSON webhook",
	intro:
		"This guide covers webhooks for received email: a message arrives at your domain and inbound POSTs it to your HTTPS endpoint. It is not about delivery, bounce or open events for mail you send. You will set up an endpoint, write a handler, verify requests and handle failed deliveries.",
	sections: [
		{
			heading: "How email becomes an HTTP POST",
			paragraphs: [
				"Mail for your domain reaches inbound through your MX records. inbound parses the message, finds the address or catch-all route that matches the recipient, and sends one POST request to the endpoint linked to that route.",
				"The body is JSON with event set to email.received, a timestamp, an email object and an endpoint object. The email parsing API page documents every field and shows a full example payload.",
			],
			bullets: [
				"Content-Type: application/json",
				"X-Webhook-Event: email.received",
				"X-Webhook-Verification-Token: your endpoint's token",
				"X-Endpoint-ID, X-Email-ID, X-Message-ID and X-Webhook-Timestamp",
				"Any custom headers you configured on the endpoint",
			],
		},
		{
			heading: "Configure an endpoint and send a test",
			paragraphs: [
				"Create a webhook endpoint in the dashboard or with POST /api/e2/endpoints. The config needs your HTTPS URL. You can set a timeout between 1 and 300 seconds (30 by default) and extra headers to send with every request.",
				"Link the endpoint to an address with POST /api/e2/email-addresses, or enable catch-all on the domain. Then send a test payload with POST /api/e2/endpoints/:id/test, and finish by sending a real email from your own mail client.",
				"For local development, expose your handler through an HTTPS tunnel and use the tunnel URL as the endpoint. Switch the endpoint to your production URL when you deploy.",
			],
		},
		{
			heading: "Verify, store, acknowledge, then do the work",
			paragraphs: [
				"Each endpoint has a verification token, created with the endpoint and readable from GET /api/e2/endpoints/:id in its config. Store it as a secret and compare it with the X-Webhook-Verification-Token header. This is a shared-token check, not an HMAC signature.",
				"Keep the handler short. Save the message keyed by email.id, queue the slow work such as attachment downloads, AI calls or replies, and return a 2xx response. Any 2xx counts as delivered; anything else, or no answer before the timeout, counts as failed.",
				"If you use the TypeScript SDK, verifyWebhookFromHeaders(request.headers, inbound) performs the same comparison by fetching the endpoint's config through the API.",
			],
			code: {
				label: "Minimal handler (Web Request/Response, e.g. a Next.js route)",
				snippet: `import { timingSafeEqual } from "node:crypto";

const expected = Buffer.from(process.env.INBOUND_WEBHOOK_TOKEN ?? "");

export async function POST(request: Request) {
  const token = Buffer.from(
    request.headers.get("x-webhook-verification-token") ?? "",
  );
  if (!expected.length || token.length !== expected.length ||
      !timingSafeEqual(token, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { event, email } = await request.json();
  if (event !== "email.received") return new Response("Ignored");

  // Your own storage and queue. saveIfNew returns false for a repeat id.
  if (await saveIfNew(email.id, email)) {
    await enqueue("process-email", { emailId: email.id });
  }
  return new Response("OK");
}`,
			},
		},
		{
			heading: "Failures, duplicates and manual retry",
			paragraphs: [
				"inbound does not retry failed webhook deliveries automatically. Each attempt is recorded with its status code or error, such as a timeout, a refused connection or a 500 from your server, and you can review it in the dashboard logs.",
				"After fixing the cause, retry with POST /api/e2/emails/:id/retry. Pass endpoint_id to retry one endpoint, delivery_id to retry one delivery, or an empty JSON object to retry every endpoint for that email. Deliveries that already succeeded or are still in progress are not sent again by a plain retry.",
				"A retried delivery carries the same email.id, so a handler that stores by that ID treats it as a no-op when the first attempt actually got through. If you send replies from a job, set an Idempotency-Key header on the reply request so a repeated job returns the existing email instead of sending twice.",
			],
			code: {
				label: "Retry a failed delivery to one endpoint",
				snippet: `curl -X POST https://inbound.new/api/e2/emails/$EMAIL_ID/retry \\
  -H "Authorization: Bearer $INBOUND_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"endpoint_id": "'"$ENDPOINT_ID"'"}'`,
			},
		},
	],
	faqs: [
		{
			question: "How can my application receive email with a webhook?",
			answer:
				"Point your domain's MX records at inbound, create a webhook endpoint with your HTTPS URL, and route an address or the whole domain to it. Every message to that address is POSTed to your URL as JSON.",
		},
		{
			question: "What should an email webhook handler return?",
			answer:
				"Any 2xx status once the message is safely stored. Return it quickly and move slow work to a queue, because a response after the endpoint timeout (30 seconds by default) is recorded as a failure. Return 401 when the verification token does not match.",
		},
		{
			question: "How do I prevent duplicate processing after a retry?",
			answer:
				"Use email.id as your idempotency key. Store it with a unique constraint and skip work when it already exists. For replies sent from your jobs, add an Idempotency-Key header so a repeated job does not send a second email.",
		},
		{
			question: "Does inbound retry failed webhooks automatically?",
			answer:
				"No. Failed deliveries are recorded, not retried on a schedule. You retry them from the dashboard or with POST /api/e2/emails/:id/retry, which lets you choose a specific endpoint or delivery.",
		},
		{
			question: "Are the webhooks signed?",
			answer:
				"They carry a per-endpoint verification token in the X-Webhook-Verification-Token header. Compare it with the token from your endpoint's config and reject requests that do not match. There is no HMAC signature on received-email webhooks.",
		},
	],
	related: [
		"email-parsing-api",
		"catch-all-email-api",
		"guides/receive-email-nodejs",
		"guides/receive-email-nextjs",
	],
	updated: "2026-09-30",
};
