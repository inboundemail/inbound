import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "guides/receive-email-nextjs",
	title: "Receive Email in Next.js App Router",
	description:
		"Receive email in a Next.js App Router route handler. Verify the webhook, queue work past serverless time limits, and reply in the same thread.",
	h1: "Receive email in Next.js with an App Router webhook",
	intro:
		"This guide is about receiving mail sent to an address on your domain, not a contact form that emails you. inbound accepts the message and POSTs it as JSON to app/api/inbound/route.ts. Because route handlers run as serverless functions with time limits, the handler only verifies and queues; a second route does the slow work and replies in thread.",
	sections: [
		{
			heading: "What you are building",
			paragraphs: [
				"A support inbox: a customer emails support@yourdomain.com, your app opens a ticket, stores the attachments, and replies in the same thread. Two route handlers split the work so neither runs long.",
				"The queue here is Upstash QStash, which calls an HTTP route and retries it on failure. Any queue that can call a URL or run a background function works the same way.",
			],
			bullets: [
				"A domain added in inbound with verified MX records",
				"A webhook endpoint pointing at /api/inbound, and support@ routed to it",
				"The endpoint's token, from config.verificationToken in GET https://inbound.new/api/e2/endpoints/{id}",
			],
			code: {
				label: "Project layout",
				snippet: `app/
  api/
    inbound/
      route.ts        # verify token, publish to QStash, return 200
      worker/
        route.ts      # called by QStash: ticket, attachments, reply
.env.local            # server-only, never NEXT_PUBLIC_
  INBOUND_API_KEY
  INBOUND_WEBHOOK_TOKEN
  QSTASH_TOKEN
  QSTASH_CURRENT_SIGNING_KEY
  QSTASH_NEXT_SIGNING_KEY
  APP_URL`,
			},
		},
		{
			heading: "The route handler: app/api/inbound/route.ts",
			paragraphs: [
				"inbound sends your endpoint's token in the X-Webhook-Verification-Token header. Compare it in constant time and return 401 on a mismatch. It is a shared token, not a signature, so keep it in a server-only environment variable.",
				"Use the Node.js runtime, the default for route handlers, because the check uses node:crypto. Route handlers run on the server, so plain process.env is enough; a NEXT_PUBLIC_ prefix would expose the secrets to the browser bundle.",
				"Publish a small message with the email ID and attachment metadata, then return 200. The deduplicationId tells QStash to drop a repeat of the same email it has seen recently.",
			],
			code: {
				label: "app/api/inbound/route.ts",
				snippet: `import { timingSafeEqual } from "node:crypto";
import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

function verified(header: string | null) {
  const expected = Buffer.from(process.env.INBOUND_WEBHOOK_TOKEN ?? "");
  const got = Buffer.from(header ?? "");
  return expected.length > 0 && got.length === expected.length && timingSafeEqual(got, expected);
}

export async function POST(request: Request) {
  if (!verified(request.headers.get("x-webhook-verification-token"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { event, email } = await request.json();
  if (event !== "email.received") return new Response(null, { status: 204 });

  await qstash.publishJSON({
    url: \`\${process.env.APP_URL}/api/inbound/worker\`,
    body: { emailId: email.id, subject: email.subject, attachments: email.parsedData.attachments },
    deduplicationId: email.id,
  });
  return Response.json({ ok: true });
}`,
			},
		},
		{
			heading: "Slow work outside the request: the worker route",
			paragraphs: [
				"inbound waits 30 seconds for a response by default, and your host caps how long a function may run. Downloading attachments or calling a model inside the webhook request risks hitting both. Returning 200 before the work is stored somewhere durable loses the email if the function is stopped.",
				"Next.js after() runs code once the response is sent, but inside the same invocation and time limit. It is fine for logging; it is not a queue.",
				"The worker verifies the QStash signature, opens the ticket, downloads each attachment through its downloadUrl with your API key, and replies with POST /api/e2/emails/{id}/reply. If it throws, QStash retries, so make ticket creation idempotent with a unique constraint on emailId, and send the reply with an Idempotency-Key. createTicket and storeAttachment stand in for your own code.",
			],
			code: {
				label: "app/api/inbound/worker/route.ts",
				snippet: `import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

export const maxDuration = 60; // seconds; your hosting plan sets the ceiling
const auth = { Authorization: \`Bearer \${process.env.INBOUND_API_KEY}\` };

async function handler(request: Request) {
  const { emailId, subject, attachments } = await request.json();
  await createTicket(emailId, subject); // upsert on a unique emailId

  for (const file of attachments ?? []) {
    const res = await fetch(file.downloadUrl, { headers: auth });
    if (!res.ok) throw new Error(\`Download failed: \${res.status}\`);
    await storeAttachment(emailId, file.filename, await res.arrayBuffer());
  }

  const reply = await fetch(\`https://inbound.new/api/e2/emails/\${emailId}/reply\`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json", "Idempotency-Key": \`ticket-\${emailId}\` },
    body: JSON.stringify({ from: "support@yourdomain.com", text: "Thanks, we opened a ticket." }),
  });
  if (!reply.ok) throw new Error(\`Reply failed: \${reply.status}\`);
  return Response.json({ ok: true });
}

export const POST = verifySignatureAppRouter(handler);`,
			},
		},
		{
			heading: "Local testing, deployment and routing failures",
			paragraphs: [
				"inbound does not deliver to localhost, and neither can QStash, so run next dev behind a tunnel and set APP_URL to the tunnel address. The endpoint test call below sends a sample payload to any URL through overrideUrl without changing the saved endpoint. The sample uses a made-up email ID, so the worker's download and reply calls will return 404; send a real email to check the whole loop.",
				"When you deploy, add the same variables to your hosting project and update the endpoint URL to your production domain. If preview deployments are password-protected, inbound's requests to them will be blocked.",
			],
			bullets: [
				"Auth middleware or proxy.ts that redirects /api/inbound to a login page: exclude the path from its matcher",
				"401: INBOUND_WEBHOOK_TOKEN is missing in the deployed environment or belongs to another endpoint",
				"404: the endpoint URL does not match the route.ts path, including a trailing slash",
				"Timeouts: slow work is running in the webhook request instead of the worker",
				"Missed messages are not retried automatically; after fixing the cause, call POST /api/e2/emails/{id}/retry",
			],
			code: {
				label: "Send a test payload to your tunnel",
				snippet: `curl -X POST https://inbound.new/api/e2/endpoints/$ENDPOINT_ID/test \\
  -H "Authorization: Bearer $INBOUND_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"overrideUrl":"https://YOUR-TUNNEL.trycloudflare.com/api/inbound"}'`,
			},
		},
	],
	faqs: [
		{
			question: "How can my Next.js app receive email with a webhook?",
			answer:
				"Point your domain's MX records at inbound, create a webhook endpoint for https://yourdomain.com/api/inbound, and route an address to it. inbound then POSTs every message to your route handler as JSON with event set to email.received.",
		},
		{
			question: "What should the route handler return?",
			answer:
				"Any 2xx status once the email is safely queued. inbound treats other statuses and requests that exceed the endpoint timeout (30 seconds by default) as failed deliveries. Return 401 when the verification token does not match.",
		},
		{
			question: "How do I prevent duplicate processing?",
			answer:
				"inbound does not retry on its own, but a manual retry or your queue's retries can run the same email twice. Key everything on email.id: a deduplicationId on the queue message, a unique constraint in your database, and an Idempotency-Key on the reply.",
		},
		{
			question: "Can I use the inbound SDK in a route handler?",
			answer:
				"Yes. The npm package inboundemail is server-only TypeScript and works in route handlers. Its verifyWebhookFromHeaders helper fetches the endpoint config on every request, which adds one API call per email; comparing against a stored token avoids that.",
		},
	],
	related: [
		"email-webhook-api",
		"email-parsing-api",
		"guides/receive-email-nodejs",
	],
	updated: "2026-09-30",
};
