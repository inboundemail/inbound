import type { SeoPage } from "@/lib/marketing/seo-pages/types";

export const page: SeoPage = {
	slug: "email-api-for-ai-agents",
	title: "Email API for AI Agents: Receive and Reply",
	description:
		"Give AI agents email addresses on your domain. Receive messages, process attachments, and send threaded replies through inbound's API.",
	h1: "Give your AI agents an email address and reply loop",
	intro:
		"Give a support agent an address on your domain, deliver incoming messages to your application, and reply in the same conversation. inbound supplies the email infrastructure; your application decides what the agent can do.",
	sections: [
		{
			heading: "An email identity for your agent",
			paragraphs: [
				"Connect a domain or receiving subdomain, then route an address such as support@agents.example.com to a webhook. inbound delivers an email.received JSON event with parsed content, attachment download URLs, and thread information.",
				"This gives your agent an identity on a domain you control. Connecting an existing human Gmail or Outlook mailbox is a separate integration; creating an inbound address does not grant access to that mailbox.",
			],
		},
		{
			heading: "Receive a support question, load context, and reply",
			paragraphs: [
				"After verifying and durably storing a webhook, use email.id to identify the message and email.threadId to retrieve its conversation. Load your own customer context, prepare a draft, and apply your application's approval policy before sending.",
				"This worker function takes the webhook's email object. You supply draftAndApprove: an application function that receives the message and thread, then returns approved reply text or null. Set INBOUND_API_KEY and AGENT_FROM to your server-side API key and authorized sending address.",
				"The reply endpoint sets In-Reply-To and References for you. The example reuses one idempotency key for the same support reply; a separate intended reply needs its own key.",
			],
			code: {
				label: "JavaScript worker: retrieve context and send an approved reply",
				snippet: `async function replyToSupportEmail(email, draftAndApprove) {
  const base = "https://inbound.new/api/e2";
  const headers = {
    Authorization: \`Bearer \${process.env.INBOUND_API_KEY}\`,
  };
  let thread = null;
  if (email.threadId) {
    const res = await fetch(
      \`\${base}/mail/threads/\${encodeURIComponent(email.threadId)}\`,
      { headers },
    );
    if (!res.ok) throw new Error(\`Thread lookup: \${res.status}\`);
    thread = await res.json();
  }
  const text = await draftAndApprove({ email, thread });
  if (!text) return;
  const res = await fetch(\`\${base}/emails/\${encodeURIComponent(email.id)}/reply\`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json",
      "Idempotency-Key": \`support-reply-\${email.id}\` },
    body: JSON.stringify({ from: process.env.AGENT_FROM, text }),
  });
  if (!res.ok) throw new Error(\`Reply failed: \${res.status}\`);
}`,
			},
		},
		{
			heading: "Map addresses to agents and tenants",
			paragraphs: [
				"Create dedicated address routes or use a domain catch-all with an application-owned address map. For example, customer-42@agents.example.com can resolve to a particular customer's support agent without creating a separate endpoint for every customer.",
				"Your application must enforce tenant access before loading customer records, thread history, or attachments. A catch-all alias is a routing identity, not an isolated security boundary. Validate the recipient against your own tenant map rather than trusting the visible To header.",
				"inbound stores mail and exposes thread list and detail endpoints. Persist the workflow state you need separately: tenant ownership, draft revisions, approvals, tool results, and completed actions. An email thread ID does not replace your application's conversation state or authorization checks.",
			],
		},
		{
			heading: "Connect through the API, CLI, or agent tools",
			paragraphs: [
				"Use REST or the inboundemail TypeScript SDK in your application. For agent-driven operation, inbound also provides the inboundctl CLI, an installable agent skill, and a hosted MCP server. The docs cover API setup; plans start at $4/month, with current details on the pricing page.",
			],
			bullets: [
				"inboundctl: inbox search, thread lookup, draft validation, JSON output, and send/reply dry runs. A dry run helps inspect a proposed send; your application still owns approval.",
				"Agent skill: install with npx skills add inboundemail/inbound to give your coding agent the integration instructions.",
				"Hosted MCP: connect to https://mcp.inbound.new/mcp with the x-inbound-api-key header. Keep the credential in your tool configuration, outside email content.",
				"Standard mail access: IMAP at imap.inboundemail.com:993 with TLS, plus SMTP submission at smtp.inboundemail.com:465 with TLS or :587 with STARTTLS. These access inbound mail, not an unrelated human mailbox.",
			],
		},
		{
			heading: "Build the controls around the agent",
			paragraphs: [
				"inbound transports messages, exposes conversation context, and supports Idempotency-Key on sends and replies. Your builder code must implement tool permissions, human approval where appropriate, and idempotent business actions such as creating tickets or issuing refunds.",
				"Failed webhook deliveries are not retried automatically. After fixing the cause, retry through POST /api/e2/emails/:id/retry. Make reprocessing safe before requesting a retry.",
			],
			bullets: [
				"Verify X-Webhook-Verification-Token against the endpoint's configured token, then persist and queue the event before acknowledging delivery.",
				"Treat email bodies and files as untrusted input. Keep their instructions separate from agent policy and limit which tools the agent can invoke.",
				"Download attachments using the API key, validate file type and size, and process them with bounded resources before passing extracted content to a model.",
				"Record completed work using email.id plus your tenant and action identity. An outbound idempotency key does not deduplicate database changes or other tool calls.",
				"Use a review step for actions that need human judgment. inbound's Guard filtering can allow, block, or route incoming mail on eligible plans; it does not implement your agent's approval workflow.",
			],
		},
	],
	faqs: [
		{
			question: "How can I give each agent or user a unique email address?",
			answer:
				"Create specific addresses on your connected domain, or enable catch-all routing and assign aliases in your application. Keep an explicit address-to-tenant mapping and check it before exposing messages or customer data to an agent.",
		},
		{
			question: "Can an AI agent create threaded replies?",
			answer:
				"Yes. POST /api/e2/emails/:id/reply accepts an email ID or a thread ID. A thread ID targets the latest message, and inbound sets the threading headers. Your application provides the authorized from address and reply content.",
		},
		{
			question: "What guardrails should an agent with an email inbox have?",
			answer:
				"Implement tenant-scoped access, untrusted-content handling, attachment validation, limited tool permissions, and approval for consequential actions. Record actions durably so replaying an email cannot repeat them. These are application responsibilities, separate from inbound's email routing and filtering.",
		},
		{
			question: "Do I have to use webhooks to access an agent's email?",
			answer:
				"No. inbound also exposes email and thread APIs, the inboundctl CLI, a hosted MCP server, and IMAP access. Webhooks let your application react to incoming messages; choose the access method that fits how your agent runs.",
		},
	],
	related: [
		"inbound-email-service",
		"email-parsing-api",
		"catch-all-email-api",
		"guides/receive-email-nextjs",
	],
	updated: "2026-09-30",
};
