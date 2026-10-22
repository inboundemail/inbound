import net from "node:net";
import tls from "node:tls";
import { NextResponse } from "next/server";
import { hourBucket, sendHarkNotification } from "@/lib/notifications/hark";
import { redis } from "@/lib/redis";
import { assertCronAuthorized } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const SMTP_HOST =
	process.env.GATEWAY_HEALTH_SMTP_HOST || "smtp.inboundemail.com";
const IMAP_HOST =
	process.env.GATEWAY_HEALTH_IMAP_HOST || "imap.inboundemail.com";
const CHECK_TIMEOUT_MS = 15_000;
const MIN_CERT_DAYS = 14;
const STATE_TTL_SECONDS = 7 * 24 * 60 * 60;
const FAILURE_STREAK_TTL_SECONDS = 60 * 60;
const FAILURES_BEFORE_ALERT = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

type CheckName = "smtp-465" | "smtp-587" | "imap-993";

interface CheckResult {
	check: CheckName;
	state: "ok" | "expiring" | "failing";
	detail: string;
	certExpiresAt?: string;
}

class ProbeError extends Error {}

/**
 * Reads from a socket until `complete` accepts the buffered text. The socket
 * is paused between reads so nothing sent in between is lost.
 */
function readUntil(
	socket: net.Socket,
	complete: (text: string) => boolean,
	label: string,
): Promise<string> {
	return new Promise((resolve, reject) => {
		let text = "";
		const cleanup = () => {
			socket.off("data", onData);
			socket.off("error", onError);
			socket.off("close", onClose);
			socket.pause();
		};
		const onData = (chunk: Buffer) => {
			text += chunk.toString("latin1");
			if (text.length > 16_384) {
				cleanup();
				reject(new ProbeError(`${label}: response too long`));
			} else if (complete(text)) {
				cleanup();
				resolve(text);
			}
		};
		const onError = (error: Error) => {
			cleanup();
			reject(new ProbeError(`${label}: ${error.message}`));
		};
		const onClose = () => {
			cleanup();
			reject(new ProbeError(`${label}: connection closed`));
		};
		socket.on("data", onData);
		socket.once("error", onError);
		socket.once("close", onClose);
		socket.resume();
	});
}

function smtpReplyComplete(text: string): boolean {
	const lines = text.split("\r\n").filter(Boolean);
	return text.endsWith("\r\n") && /^\d{3} /.test(lines.at(-1) ?? "");
}

async function readSmtpReply(
	socket: net.Socket,
	expectedCode: string,
	label: string,
): Promise<string> {
	const reply = await readUntil(socket, smtpReplyComplete, label);
	const lastLine = reply.split("\r\n").filter(Boolean).at(-1) ?? "";
	if (!lastLine.startsWith(`${expectedCode} `)) {
		throw new ProbeError(
			`${label}: unexpected reply "${lastLine.slice(0, 80)}"`,
		);
	}
	return reply;
}

function guardSocket(socket: net.Socket): void {
	socket.on("error", () => {});
	socket.setTimeout(CHECK_TIMEOUT_MS, () =>
		socket.destroy(new Error("socket timed out")),
	);
}

function connectTls(
	options: tls.ConnectionOptions,
	label: string,
): Promise<tls.TLSSocket> {
	return new Promise((resolve, reject) => {
		const socket = tls.connect({ ...options, rejectUnauthorized: true });
		guardSocket(socket);
		const onError = (error: Error) => {
			socket.destroy();
			reject(new ProbeError(`${label}: TLS failed (${error.message})`));
		};
		socket.once("error", onError);
		socket.once("secureConnect", () => {
			socket.off("error", onError);
			socket.pause();
			if (!socket.authorized) {
				socket.destroy();
				reject(
					new ProbeError(
						`${label}: certificate not trusted (${String(socket.authorizationError)})`,
					),
				);
				return;
			}
			resolve(socket);
		});
	});
}

function connectPlain(
	host: string,
	port: number,
	label: string,
): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		const socket = net.connect({ host, port });
		guardSocket(socket);
		const onError = (error: Error) => {
			socket.destroy();
			reject(new ProbeError(`${label}: connect failed (${error.message})`));
		};
		socket.once("error", onError);
		socket.once("connect", () => {
			socket.off("error", onError);
			socket.pause();
			resolve(socket);
		});
	});
}

function certificateExpiry(socket: tls.TLSSocket, label: string): Date {
	const certificate = socket.getPeerCertificate();
	const expiresAt = new Date(certificate?.valid_to ?? "");
	if (Number.isNaN(expiresAt.getTime())) {
		throw new ProbeError(`${label}: certificate has no expiry date`);
	}
	return expiresAt;
}

async function probeSmtpImplicitTls(): Promise<Date> {
	const label = `${SMTP_HOST}:465`;
	const socket = await connectTls(
		{ host: SMTP_HOST, port: 465, servername: SMTP_HOST },
		label,
	);
	try {
		await readSmtpReply(socket, "220", `${label} greeting`);
		socket.write("QUIT\r\n");
		return certificateExpiry(socket, label);
	} finally {
		socket.destroy();
	}
}

async function probeSmtpStartTls(): Promise<Date> {
	const label = `${SMTP_HOST}:587`;
	const plain = await connectPlain(SMTP_HOST, 587, label);
	try {
		await readSmtpReply(plain, "220", `${label} greeting`);
		plain.write("EHLO gateway-health.inbound.new\r\n");
		const ehlo = await readSmtpReply(plain, "250", `${label} EHLO`);
		if (!/^250[- ]STARTTLS\b/im.test(ehlo)) {
			throw new ProbeError(`${label}: STARTTLS not offered`);
		}
		plain.write("STARTTLS\r\n");
		await readSmtpReply(plain, "220", `${label} STARTTLS`);
		const secure = await connectTls(
			{ socket: plain, servername: SMTP_HOST },
			label,
		);
		try {
			secure.write("EHLO gateway-health.inbound.new\r\n");
			await readSmtpReply(secure, "250", `${label} EHLO after STARTTLS`);
			secure.write("QUIT\r\n");
			return certificateExpiry(secure, label);
		} finally {
			secure.destroy();
		}
	} finally {
		plain.destroy();
	}
}

async function probeImapImplicitTls(): Promise<Date> {
	const label = `${IMAP_HOST}:993`;
	const socket = await connectTls(
		{ host: IMAP_HOST, port: 993, servername: IMAP_HOST },
		label,
	);
	try {
		const greeting = await readUntil(
			socket,
			(text) => text.includes("\r\n"),
			`${label} greeting`,
		);
		if (!/^\* (OK|PREAUTH)\b/i.test(greeting)) {
			throw new ProbeError(
				`${label}: unexpected greeting "${greeting.split("\r\n")[0].slice(0, 80)}"`,
			);
		}
		socket.write("a1 LOGOUT\r\n");
		return certificateExpiry(socket, label);
	} finally {
		socket.destroy();
	}
}

async function runCheck(
	check: CheckName,
	probe: () => Promise<Date>,
): Promise<CheckResult> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const expiresAt = await Promise.race([
			probe(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new ProbeError(`timed out after ${CHECK_TIMEOUT_MS / 1000}s`),
						),
					CHECK_TIMEOUT_MS,
				);
			}),
		]);
		const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / DAY_MS);
		if (daysLeft <= MIN_CERT_DAYS) {
			return {
				check,
				state: "expiring",
				detail: `certificate expires in ${daysLeft} day(s)`,
				certExpiresAt: expiresAt.toISOString(),
			};
		}
		return {
			check,
			state: "ok",
			detail: `certificate valid for ${daysLeft} days`,
			certExpiresAt: expiresAt.toISOString(),
		};
	} catch (error) {
		return {
			check,
			state: "failing",
			detail: error instanceof Error ? error.message : "unknown error",
		};
	} finally {
		clearTimeout(timer);
	}
}

type AlertState = CheckResult["state"];

interface Transition {
	previous: AlertState | null;
	next: AlertState;
	sequence: number;
}

class RedisUnavailableError extends Error {}

function redisConfigured(): boolean {
	return !!(
		process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
	);
}

async function withRedis<T>(operation: () => Promise<T>): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		throw new RedisUnavailableError(
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * Records this run's result and returns the alert state transition, if any.
 * A failure only counts once it is seen on FAILURES_BEFORE_ALERT consecutive
 * runs. The state is swapped atomically so overlapping runs report a
 * transition once.
 */
async function recordResult(result: CheckResult): Promise<Transition | null> {
	const failuresKey = `gateway-health:failures:${result.check}`;
	const next: AlertState = result.state;
	if (result.state === "failing") {
		const failures = await withRedis(async () => {
			const count = await redis.incr(failuresKey);
			await redis.expire(failuresKey, FAILURE_STREAK_TTL_SECONDS);
			return count;
		});
		if (failures < FAILURES_BEFORE_ALERT) return null;
	} else {
		await withRedis(() => redis.del(failuresKey));
	}

	const previous = await withRedis(() =>
		redis.set<AlertState>(`gateway-health:state:${result.check}`, next, {
			ex: STATE_TTL_SECONDS,
			get: true,
		}),
	);
	const previousState =
		previous === "ok" || previous === "expiring" || previous === "failing"
			? previous
			: null;
	if (previousState === next) return null;
	if (previousState === null && next === "ok") return null;

	const sequence = await withRedis(() =>
		redis.incr(`gateway-health:transition:${result.check}`),
	);
	return { previous: previousState, next, sequence };
}

function alertBody(result: CheckResult): string {
	return result.state === "ok"
		? `Recovered: ${result.check} (${result.detail})`
		: `${result.state === "expiring" ? "Certificate expiring" : "Failing"}: ${result.check}: ${result.detail}`;
}

/**
 * Every 5 minutes: checks that the SMTP (465 implicit TLS, 587 STARTTLS) and
 * IMAP (993) gateways greet correctly with a certificate valid for their
 * hostname and more than 14 days from expiry. Sends a Hark alert only when a
 * check changes state, and counts a connection failure only after two
 * consecutive runs; without Redis, at most one alert per check per hour.
 */
export async function GET(request: Request) {
	const unauthorizedResponse = assertCronAuthorized(request, "gateway-health");
	if (unauthorizedResponse) return unauthorizedResponse;

	const results = await Promise.all([
		runCheck("smtp-465", probeSmtpImplicitTls),
		runCheck("smtp-587", probeSmtpStartTls),
		runCheck("imap-993", probeImapImplicitTls),
	]);

	const alerts: string[] = [];
	await Promise.all(
		results.map(async (result) => {
			let idempotencyKey: string;
			try {
				if (!redisConfigured()) {
					throw new RedisUnavailableError("Redis is not configured");
				}
				const transition = await recordResult(result);
				if (!transition) return;
				idempotencyKey = `gateway-health:${result.check}:${transition.sequence}:${transition.previous ?? "none"}-${transition.next}`;
			} catch (error) {
				if (!(error instanceof RedisUnavailableError)) throw error;
				console.error(
					`[gateway-health] Redis unavailable for ${result.check}, falling back to hourly alerts: ${error.message}`,
				);
				if (result.state === "ok") return;
				idempotencyKey = `gateway-health:${result.check}:${result.state}:${hourBucket()}`;
			}

			const body = alertBody(result);
			alerts.push(body);
			await sendHarkNotification({
				title: "Mail gateway health",
				body: body.slice(0, 240),
				idempotencyKey,
			});
		}),
	);

	const healthy = results.every((result) => result.state === "ok");
	if (!healthy) console.error("[gateway-health] checks failing:", results);
	return NextResponse.json({ healthy, results, alerts });
}
