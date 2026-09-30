import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "guides/receive-email-nodejs",
	title: "Receive Email in Node.js with Webhooks",
	description:
		"Build a Node.js webhook that receives email, handles attachments, and replies in thread. Includes local testing and duplicate-event handling.",
	h1: "Receive email in Node.js with a webhook",
	intro:
		"Nodemailer sends email; it does not receive it. To receive mail in Node.js, point your domain's MX records at inbound and it POSTs each message to your Express app as JSON. This guide builds a long-running service with a queue worker that downloads attachments and replies in the same thread.",
	sections: [
		{
			heading: "Before you start: receiving is not Nodemailer",
			paragraphs: [
				"Receiving email means something has to accept SMTP connections for your domain. inbound does that part: you add a domain, point its MX records at inbound, and route an address or a catch-all to a webhook endpoint.",
				"Your Node.js code then only handles HTTP. This guide assumes a long-running process, such as a container or a VM, with Redis available for a BullMQ job queue.",
			],
			bullets: [
				"A domain added in inbound with verified MX records",
				"A webhook endpoint, and an email address routed to it",
				"An API key, sent as Authorization: Bearer <key>",
				"The endpoint's verification token: GET https://inbound.new/api/e2/endpoints/{id} returns it as config.verificationToken",
			],
			code: {
				label: "Install and configure",
				snippet: `npm install express bullmq

# .env (server only, never commit)
INBOUND_API_KEY=your_api_key
INBOUND_WEBHOOK_TOKEN=your_endpoint_verification_token`,
			},
		},
		{
			heading: "The Express webhook handler",
			paragraphs: [
				"Every delivery carries an X-Webhook-Verification-Token header with your endpoint's token. Compare it with the stored value in constant time and reject anything else with 401. It is a shared token, not a signature, so serve the endpoint over HTTPS and keep the token secret.",
				"Express parses JSON bodies up to 100 kB by default. inbound payloads include the text, HTML and raw MIME source, so they often exceed that. Raise the limit on this route.",
				"Queue the payload and answer 200 before doing any real work. Using email.id as the BullMQ job ID means a repeated delivery of the same email does not create a second job.",
			],
			code: {
				label: "server.ts",
				snippet: `import { timingSafeEqual } from "node:crypto";
import express from "express";
import { Queue } from "bullmq";

const queue = new Queue("inbound-email", { connection: { host: "127.0.0.1", port: 6379 } });
const expected = Buffer.from(process.env.INBOUND_WEBHOOK_TOKEN ?? "");

function isFromInbound(header: string | undefined) {
  const got = Buffer.from(header ?? "");
  return expected.length > 0 && got.length === expected.length && timingSafeEqual(got, expected);
}

const app = express();
app.post("/webhooks/inbound", express.json({ limit: "5mb" }), async (req, res) => {
  if (!isFromInbound(req.get("X-Webhook-Verification-Token"))) {
    res.sendStatus(401);
    return;
  }
  const { event, email } = req.body;
  if (event === "email.received") {
    await queue.add(event, req.body, {
      jobId: email.id, attempts: 5, backoff: { type: "exponential", delay: 10_000 },
    });
  }
  res.sendStatus(200);
});
app.listen(3000);`,
			},
		},
		{
			heading: "A worker that downloads attachments and replies",
			paragraphs: [
				"The worker runs as its own process and reads jobs from Redis. Each item in email.parsedData.attachments has a filename, contentType, size and downloadUrl. Fetch the downloadUrl with your API key to get the file bytes; saveFile below stands in for your own storage code.",
				"The reply goes to POST /api/e2/emails/{id}/reply. It defaults to the original sender and a Re: subject, and inbound sets In-Reply-To and References so the reply lands in the same thread. The from address must be on a domain you have verified.",
				"BullMQ retries failed jobs, so the reply must be safe to repeat. With an Idempotency-Key header, a repeated key returns the reply that was already sent instead of sending another. A 409 means the same reply is still in progress.",
			],
			code: {
				label: "worker.ts",
				snippet: `import { Worker } from "bullmq";

const auth = { Authorization: \`Bearer \${process.env.INBOUND_API_KEY}\` };

new Worker("inbound-email", async (job) => {
  const { email } = job.data;

  for (const file of email.parsedData.attachments ?? []) {
    const res = await fetch(file.downloadUrl, { headers: auth });
    if (!res.ok) throw new Error(\`Download failed: \${res.status}\`);
    await saveFile(email.id, file.filename, Buffer.from(await res.arrayBuffer()));
  }

  const reply = await fetch(\`https://inbound.new/api/e2/emails/\${email.id}/reply\`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json", "Idempotency-Key": \`ack-\${email.id}\` },
    body: JSON.stringify({ from: "support@yourdomain.com", text: "Thanks, we got your message." }),
  });
  if (!reply.ok) throw new Error(\`Reply failed: \${reply.status}\`);
}, { connection: { host: "127.0.0.1", port: 6379 }, concurrency: 5 });`,
			},
		},
		{
			heading: "Test locally, then deploy",
			paragraphs: [
				"inbound does not deliver to localhost or private IP addresses, so expose your dev server with a tunnel such as cloudflared or ngrok and use the public URL for the endpoint.",
				"Send a real email from your own mail client to the routed address. Expect a 200 in the server log, a finished job, the saved attachment, and a reply in your inbox threaded under your message.",
				"In production, run the web server and the worker as separate processes, and call worker.close() on shutdown so in-flight jobs finish.",
			],
			bullets: [
				"401 in your log: INBOUND_WEBHOOK_TOKEN does not match the endpoint's config.verificationToken",
				"413 from Express: the JSON body limit on the route is too low",
				"Timeouts: inbound waits 30 seconds by default (configurable per endpoint), so keep the handler to verify and enqueue",
				"Missed messages: failed deliveries are recorded but not retried automatically. Resend one with POST /api/e2/emails/{id}/retry",
			],
			code: {
				label: "Expose port 3000 and create the endpoint",
				snippet: `cloudflared tunnel --url http://localhost:3000

curl -X POST https://inbound.new/api/e2/endpoints \\
  -H "Authorization: Bearer $INBOUND_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"node-dev","type":"webhook",
       "config":{"url":"https://YOUR-TUNNEL.trycloudflare.com/webhooks/inbound"}}'`,
			},
		},
	],
	faqs: [
		{
			question: "How do I receive email in Node.js?",
			answer:
				"Either run an SMTP server yourself, poll a mailbox over IMAP, or let a service accept mail for your domain and POST it to you. With inbound you point MX records at inbound, route an address to a webhook endpoint, and handle a JSON POST in Express as shown above.",
		},
		{
			question: "Can Nodemailer receive email?",
			answer:
				"No. Nodemailer is a client for sending mail over SMTP. It has no way to accept incoming messages, so you need an MX-receiving server or service, or an IMAP client that reads an existing mailbox.",
		},
		{
			question: "How do I separate attachments from a raw MIME message?",
			answer:
				"You usually do not have to. parsedData.attachments lists each file with its metadata and a downloadUrl, and the raw MIME source is also included in parsedData.raw. When a payload would exceed 1 MB, inbound strips attachment bodies from raw, so download files through their downloadUrl.",
		},
		{
			question: "What happens if my Node.js server is down?",
			answer:
				"The delivery fails after the endpoint timeout and is recorded as failed. inbound does not retry it automatically. Once your server is back, call POST /api/e2/emails/{id}/retry for each affected email, optionally with an endpointId or deliveryId.",
		},
		{
			question: "Is there a Node.js SDK?",
			answer:
				"Yes, the official TypeScript SDK is the npm package inboundemail. It includes verifyWebhookFromHeaders, which fetches the endpoint's config on each request to compare the token. This guide uses fetch and a stored token so every call is visible.",
		},
	],
	related: [
		"email-webhook-api",
		"email-parsing-api",
		"guides/receive-email-nextjs",
	],
	updated: "2026-09-30",
};
