import { Ratelimit } from "@upstash/ratelimit";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { structuredEmails } from "@/lib/db/schema";
import { realtime } from "@/lib/realtime";
import { redis } from "@/lib/redis";

const INBOX_DOMAIN = "inbox.inbound.new";
const LOCAL_PART_PATTERN = /^[a-z0-9-]{1,64}$/;
const MAX_EMAIL_AGE_MS = 10 * 60 * 1000;
const EMITTED_TTL_SECONDS = 60 * 60;

const perInboxLimit = new Ratelimit({
	redis,
	limiter: Ratelimit.slidingWindow(10, "1 m"),
	prefix: "ratelimit:inbox-homepage:inbox",
});

const globalLimit = new Ratelimit({
	redis,
	limiter: Ratelimit.slidingWindow(300, "1 m"),
	prefix: "ratelimit:inbox-homepage:global",
});

type InboxHomepagePayload = {
	email?: { id?: unknown };
};

type FromData = {
	text?: string;
	addresses?: Array<{ name?: string | null; address?: string | null }>;
};

function parseFrom(fromData: string | null) {
	if (!fromData) return "unknown sender";
	try {
		const parsed = JSON.parse(fromData) as FromData;
		const first = parsed.addresses?.[0];
		if (first?.address) {
			return first.name ? `${first.name} <${first.address}>` : first.address;
		}
		return parsed.text || "unknown sender";
	} catch {
		return "unknown sender";
	}
}

function demoRecipient(recipients: Array<string | null>) {
	const suffix = `@${INBOX_DOMAIN}`;
	for (const recipient of recipients) {
		const normalized = recipient?.trim().toLowerCase();
		if (normalized?.endsWith(suffix)) {
			return normalized.slice(0, -suffix.length);
		}
	}
	return null;
}

export async function POST(request: Request) {
	let payload: InboxHomepagePayload;
	try {
		payload = (await request.json()) as InboxHomepagePayload;
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}

	const emailId = payload.email?.id;
	if (typeof emailId !== "string" || emailId.length === 0 || emailId.length > 255) {
		return new Response("Missing email id", { status: 400 });
	}

	try {
		const [email] = await db
			.select({
				id: structuredEmails.id,
				recipient: structuredEmails.recipient,
				envelopeRecipients: structuredEmails.envelopeRecipients,
				fromData: structuredEmails.fromData,
				subject: structuredEmails.subject,
				textBody: structuredEmails.textBody,
			})
			.from(structuredEmails)
			.where(
				and(
					eq(structuredEmails.id, emailId),
					gte(structuredEmails.createdAt, new Date(Date.now() - MAX_EMAIL_AGE_MS)),
				),
			)
			.limit(1);

		if (!email) {
			return new Response("Not found", { status: 404 });
		}

		const localPart = demoRecipient([
			email.recipient,
			...(email.envelopeRecipients ?? []),
		]);
		if (!localPart || !LOCAL_PART_PATTERN.test(localPart)) {
			return new Response("Not found", { status: 404 });
		}

		const firstDelivery = await redis.set(
			`inbox-homepage:emitted:${email.id}`,
			"1",
			{ nx: true, ex: EMITTED_TTL_SECONDS },
		);
		if (firstDelivery !== "OK") {
			return new Response("OK", { status: 200 });
		}

		const [inbox, global] = await Promise.all([
			perInboxLimit.limit(localPart),
			globalLimit.limit("all"),
		]);
		if (!inbox.success || !global.success) {
			return new Response("Too many requests", { status: 429 });
		}

		const channel = realtime.channel(`inbox-${localPart}`) as typeof realtime;
		await channel.emit("inbox.emailReceived", {
			from: parseFrom(email.fromData),
			subject: email.subject || "(no subject)",
			preview: email.textBody?.slice(0, 150) ?? "",
			timestamp: new Date().toISOString(),
			emailId: email.id,
		});

		return new Response("OK", { status: 200 });
	} catch (error) {
		console.error("[inbox-homepage] Failed to process webhook:", error);
		return new Response("Internal Server Error", { status: 500 });
	}
}

export async function GET() {
	return new Response("Inbox homepage webhook is active", { status: 200 });
}
