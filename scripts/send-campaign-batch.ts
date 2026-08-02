/// <reference types="bun-types" />

/**
 * Send a batch of the agent-inbox outreach campaign via inboundctl.
 *
 * Usage:
 *   bun run scripts/send-campaign-batch.ts <batch.json> [--limit n] [--dry-run]
 *
 * Expects batch.json entries: { id, email, variant, token, home_url,
 * checkout_url, subject_domain? }.
 *
 * Safety:
 * - Skips any recipient whose campaign_links row already has sent_at
 *   (resumable, double-send proof).
 * - Stamps sent_at immediately after each successful send.
 * - 750ms between sends.
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaignLinks } from "@/lib/db/schema";

const FROM = "Ryan Vogel <ryan@inbound.new>";

type BatchRecipient = {
	id: string;
	email: string;
	variant: "custom-domain" | "generic";
	token: string;
	home_url: string;
	checkout_url: string;
	subject_domain?: string;
};

function subjectFor(r: BatchRecipient): string {
	return r.variant === "custom-domain" && r.subject_domain
		? `stop feeling bad about support@${r.subject_domain}`
		: "stop feeling bad about support@";
}

function addressLine(r: BatchRecipient): string {
	return r.variant === "custom-domain" && r.subject_domain
		? `<strong>support@${r.subject_domain}</strong> live on your domain`
		: "support@ live on your own domain";
}

function addressLineText(r: BatchRecipient): string {
	return r.variant === "custom-domain" && r.subject_domain
		? `support@${r.subject_domain} live on your domain`
		: "support@ live on your own domain";
}

function htmlFor(r: BatchRecipient): string {
	return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <div style="max-width:540px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c1917;">
    <p style="margin:0 0 16px;">every side project has an inbox nobody checks. we made it so your coding agent checks it for you.</p>
    <p style="margin:0 0 16px;">inbound inboxes are now fully agent-managed &mdash; opencode, claude code, codex, cursor, or any agent can read what comes in, reply in thread, and flag the stuff that actually needs you.</p>
    <p style="margin:0 0 24px;">the default plan covers it: $4/mo gets you ${addressLine(r)}, 5,000 emails in, 5,000 out, and email support from us. that's more volume than any side project's support inbox will ever see &mdash; your agent has plenty of room to just handle it.</p>
    <p style="margin:0 0 24px;">
      <a href="${r.checkout_url}" style="display:inline-block;background-color:#8161FF;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px;">upgrade to default &mdash; $4/mo</a>
    </p>
    <p style="margin:0 0 24px;">or just look around: <a href="${r.home_url}" style="color:#8161FF;text-decoration:underline;">inbound.new</a></p>
    <p style="margin:0 0 32px;">&mdash; ryan</p>
    <p style="margin:0;padding-top:16px;border-top:1px solid #e7e5e4;font-size:13px;color:#a8a29e;">this campaign was sent and is managed via <a href="${r.home_url}" style="color:#a8a29e;">inboundctl</a>. feel free to reply &mdash; an agent will get back to you shortly. or a human, who knows.</p>
  </div>
</body>
</html>`;
}

function textFor(r: BatchRecipient): string {
	return `every side project has an inbox nobody checks. we made it so your coding agent checks it for you.

inbound inboxes are now fully agent-managed — opencode, claude code, codex, cursor, or any agent can read what comes in, reply in thread, and flag the stuff that actually needs you.

the default plan covers it: $4/mo gets you ${addressLineText(r)}, 5,000 emails in, 5,000 out, and email support from us. that's more volume than any side project's support inbox will ever see — your agent has plenty of room to just handle it.

upgrade to default — $4/mo:
${r.checkout_url}

or just look around:
${r.home_url}

— ryan

--
this campaign was sent and is managed via inboundctl. feel free to reply — an agent will get back to you shortly. or a human, who knows.`;
}

const args = process.argv.slice(2);
const batchPath = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx > -1 ? Number(args[limitIdx + 1]) : Infinity;

if (!batchPath) {
	console.error(
		"usage: bun run scripts/send-campaign-batch.ts <batch.json> [--limit n] [--dry-run]",
	);
	process.exit(1);
}

const batch = JSON.parse(readFileSync(batchPath, "utf8")) as BatchRecipient[];

let sent = 0;
let skipped = 0;
let failed = 0;

for (const r of batch) {
	if (sent >= limit) break;

	const [link] = await db
		.select({ sentAt: campaignLinks.sentAt })
		.from(campaignLinks)
		.where(eq(campaignLinks.token, r.token))
		.limit(1);
	if (!link) {
		console.error(`SKIP ${r.email}: no campaign_links row for ${r.token}`);
		skipped++;
		continue;
	}
	if (link.sentAt) {
		skipped++;
		continue;
	}

	if (dryRun) {
		console.log(`DRY ${r.email} [${r.variant}] "${subjectFor(r)}"`);
		sent++;
		continue;
	}

	const proc = Bun.spawnSync([
		"inboundctl",
		"send",
		"--from",
		FROM,
		"--to",
		r.email,
		"--subject",
		subjectFor(r),
		"--text",
		textFor(r),
		"--html",
		htmlFor(r),
		"--json",
	]);

	if (proc.exitCode !== 0) {
		console.error(
			`FAIL ${r.email}: ${proc.stderr.toString().trim() || proc.stdout.toString().trim()}`,
		);
		failed++;
		continue;
	}

	const result = JSON.parse(proc.stdout.toString());
	await db
		.update(campaignLinks)
		.set({ sentAt: new Date() })
		.where(eq(campaignLinks.token, r.token));
	sent++;
	console.log(`SENT ${sent} ${r.email} [${r.variant}] ${result.id}`);

	await new Promise((resolve) => setTimeout(resolve, 750));
}

console.log(`\ndone: ${sent} sent, ${skipped} skipped, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
