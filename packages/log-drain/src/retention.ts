import { type Env, intVar, logPrefix } from "./env";
import { dayPrefix } from "./storage";

const DAY_MS = 86_400_000;
const CATCH_UP_DAYS = 7;

export async function enforceRetention(env: Env, now = Date.now()): Promise<number> {
	const retentionDays = intVar(env.RETENTION_DAYS, 30);
	const prefix = logPrefix(env);
	let deleted = 0;
	for (let age = retentionDays + 1; age <= retentionDays + CATCH_UP_DAYS; age++) {
		const dayStart = Math.floor((now - age * DAY_MS) / DAY_MS) * DAY_MS;
		let cursor: string | undefined;
		do {
			const listed = await env.LOGS.list({ prefix: dayPrefix(prefix, dayStart), cursor, limit: 1000 });
			const keys = listed.objects.map((o) => o.key);
			if (keys.length > 0) {
				await env.LOGS.delete(keys);
				deleted += keys.length;
			}
			cursor = listed.truncated ? listed.cursor : undefined;
		} while (cursor);
	}
	return deleted;
}
