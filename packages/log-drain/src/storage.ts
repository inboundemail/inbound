import { type Env, type LogRecord, logPrefix } from "./env";

const HOUR_MS = 3_600_000;
const MAX_SEND_BYTES = 4 * 1024 * 1024;

function pad(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

export function dayPrefix(prefix: string, ms: number): string {
	const d = new Date(ms);
	return `${prefix}year=${d.getUTCFullYear()}/month=${pad(d.getUTCMonth() + 1)}/day=${pad(d.getUTCDate())}/`;
}

export function hourPrefix(prefix: string, ms: number): string {
	return `${dayPrefix(prefix, ms)}hour=${pad(new Date(ms).getUTCHours())}/`;
}

export function hourFloor(ms: number): number {
	return Math.floor(ms / HOUR_MS) * HOUR_MS;
}

export async function gzip(text: string): Promise<ArrayBuffer> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
	return new Response(stream).arrayBuffer();
}

export async function storeRecords(env: Env, records: LogRecord[]): Promise<void> {
	if (records.length === 0) return;
	if (env.LOG_STREAM) {
		let chunk: LogRecord[] = [];
		let size = 0;
		for (const record of records) {
			const bytes = JSON.stringify(record).length + 1;
			if (chunk.length > 0 && size + bytes > MAX_SEND_BYTES) {
				await env.LOG_STREAM.send(chunk);
				chunk = [];
				size = 0;
			}
			chunk.push(record);
			size += bytes;
		}
		if (chunk.length > 0) await env.LOG_STREAM.send(chunk);
		return;
	}

	const now = Date.now();
	const body = await gzip(`${records.map((r) => JSON.stringify(r)).join("\n")}\n`);
	const key = `${hourPrefix(logPrefix(env), now)}${now}-${crypto.randomUUID()}.json.gz`;
	await env.LOGS.put(key, body, {
		httpMetadata: { contentType: "application/x-ndjson" },
		customMetadata: { records: String(records.length) },
	});
}
