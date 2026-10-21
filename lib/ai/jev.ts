/**
 * Minimal client for Jev, TypeSafe AI's decision model (System One API).
 *
 * Request and response bodies contain email content, so they are never logged.
 * Errors carry the HTTP status only.
 */

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_JEV_MODEL = "jev-1.13.0";

const TOTAL_BUDGET_MS = 4_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
const MAX_JITTER_MS = 250;

export interface JevNoulQuestion {
	type: "noul";
	instructions: string | Record<string, unknown>;
	criteria?: { true: string; false: string };
}

export interface JevNoulAnswer {
	noul: number;
}

export interface JevResult {
	model: string;
	answers: Record<string, JevNoulAnswer | undefined>;
}

export type JevErrorCode =
	| "missing_api_key"
	| "http"
	| "timeout"
	| "network"
	| "invalid_response";

export class JevError extends Error {
	readonly code: JevErrorCode;
	readonly status?: number;

	constructor(code: JevErrorCode, status?: number) {
		super(
			status !== undefined
				? `Jev request failed (${status})`
				: `Jev request failed (${code})`,
		);
		this.name = "JevError";
		this.code = code;
		this.status = status;
	}
}

export function getJevModel(): string {
	return process.env.TYPESAFE_MODEL?.trim() || DEFAULT_JEV_MODEL;
}

function isRetryableStatus(status: number): boolean {
	return status === 429 || status === 529 || status >= 500;
}

function retryAfterMs(header: string | null): number | undefined {
	if (!header) return undefined;
	const seconds = Number(header);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const date = Date.parse(header);
	return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function isTimeout(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.name === "TimeoutError" || error.name === "AbortError")
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResult(body: unknown): JevResult {
	if (
		!isRecord(body) ||
		typeof body.model !== "string" ||
		!isRecord(body.answers)
	) {
		throw new JevError("invalid_response");
	}
	const answers: Record<string, JevNoulAnswer | undefined> = {};
	for (const [id, answer] of Object.entries(body.answers)) {
		if (
			isRecord(answer) &&
			typeof answer.noul === "number" &&
			Number.isFinite(answer.noul)
		) {
			answers[id] = { noul: Math.min(1, Math.max(0, answer.noul)) };
		}
	}
	return { model: body.model, answers };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ask Jev one or more noul questions about `state` in a single request.
 * Retries 429, 529 and other 5xx responses (and network errors) with
 * exponential backoff and jitter, within a 4s total budget.
 */
export async function askJev(
	state: Record<string, unknown>,
	questions: Record<string, JevNoulQuestion>,
): Promise<JevResult> {
	const apiKey = process.env.TYPESAFE_API_KEY?.trim();
	if (!apiKey) {
		throw new JevError("missing_api_key");
	}

	const deadline = Date.now() + TOTAL_BUDGET_MS;
	const body = JSON.stringify({ model: getJevModel(), state, questions });

	for (let attempt = 1; ; attempt++) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) throw new JevError("timeout");

		let failure: JevError;
		let waitMs =
			BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * MAX_JITTER_MS;

		try {
			const response = await fetch(JEV_ENDPOINT, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body,
				signal: AbortSignal.timeout(remaining),
			});

			if (response.ok) {
				let json: unknown;
				try {
					json = await response.json();
				} catch (error) {
					throw new JevError(isTimeout(error) ? "timeout" : "invalid_response");
				}
				return parseResult(json);
			}

			await response.body?.cancel().catch(() => {});
			failure = new JevError("http", response.status);
			if (!isRetryableStatus(response.status)) throw failure;
			waitMs = retryAfterMs(response.headers.get("retry-after")) ?? waitMs;
		} catch (error) {
			if (error instanceof JevError) throw error;
			if (isTimeout(error)) {
				throw new JevError("timeout");
			}
			failure = new JevError("network");
		}

		if (attempt >= MAX_ATTEMPTS || waitMs >= deadline - Date.now()) {
			throw failure;
		}
		await sleep(waitMs);
	}
}
