import { Ratelimit } from "@upstash/ratelimit";
import { z } from "zod/v4";
import { DEVICES, recordBatch } from "@/lib/analytics/store";
import { redis } from "@/lib/redis";

const MAX_BODY_BYTES = 32_000;
const BOT_PATTERN =
	/bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|curl|wget|python-requests/i;

const limiter = new Ratelimit({
	redis,
	limiter: Ratelimit.slidingWindow(120, "1 m"),
	prefix: "ratelimit:analytics:collect",
});

const device = z.enum(DEVICES);
const path = z.string().min(1).max(300);

const eventSchema = z.discriminatedUnion("t", [
	z.object({
		t: z.literal("pv"),
		p: path,
		d: device,
		entry: z.boolean().optional(),
		r: z.string().max(100).optional(),
	}),
	z.object({
		t: z.literal("click"),
		p: path,
		d: device,
		x: z.number().min(0).max(1),
		y: z.number().min(0).max(100_000),
		label: z.string().max(200).optional(),
	}),
	z.object({
		t: z.literal("move"),
		p: path,
		d: device,
		cells: z.record(z.string().max(12), z.number()).refine(
			(cells) => Object.keys(cells).length <= 400,
		),
	}),
	z.object({
		t: z.literal("scroll"),
		p: path,
		d: device,
		depth: z.number().min(0).max(100),
	}),
]);

const batchSchema = z.object({
	v: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
	s: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
	events: z.array(eventSchema).min(1).max(60),
});

function clientIp(request: Request) {
	return (
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		"unknown"
	);
}

export async function POST(request: Request) {
	if (BOT_PATTERN.test(request.headers.get("user-agent") ?? "")) {
		return new Response(null, { status: 204 });
	}

	const body = await request.text();
	if (body.length > MAX_BODY_BYTES) {
		return new Response("Payload too large", { status: 413 });
	}

	let json: unknown;
	try {
		json = JSON.parse(body);
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}

	const parsed = batchSchema.safeParse(json);
	if (!parsed.success) {
		return new Response("Invalid batch", { status: 400 });
	}

	try {
		const { success } = await limiter.limit(clientIp(request));
		if (!success) return new Response("Too many requests", { status: 429 });

		await recordBatch({
			visitorId: parsed.data.v,
			sessionId: parsed.data.s,
			events: parsed.data.events,
		});
		return new Response(null, { status: 204 });
	} catch (error) {
		console.error("[analytics] Failed to record batch:", error);
		return new Response("Internal Server Error", { status: 500 });
	}
}
