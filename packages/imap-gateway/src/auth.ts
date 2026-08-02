import { createHash } from "node:crypto";
import type { ImapConfig } from "./config.ts";

const CACHE_TTL_MS = 5 * 60_000;

interface DomainRow {
	domain: string;
	status: string;
	userId: string;
}

interface CacheEntry {
	expires: number;
	userId: string;
}

export class ApiAuth {
	private config: ImapConfig;
	private cache = new Map<string, CacheEntry>();

	constructor(config: ImapConfig) {
		this.config = config;
	}

	async authenticate(
		address: string,
		apiKey: string,
	): Promise<{ userId: string } | null> {
		const domain = address.split("@")[1];
		if (!domain) return null;

		const cacheKey = createHash("sha256")
			.update(`${address}\n${apiKey}`)
			.digest("hex");
		const cached = this.cache.get(cacheKey);
		if (cached && cached.expires > Date.now()) {
			return { userId: cached.userId };
		}
		this.cache.delete(cacheKey);

		const response = await fetch(
			`${this.config.apiBaseUrl}/domains?limit=100`,
			{
				headers: { Authorization: `Bearer ${apiKey}` },
			},
		);
		if (!response.ok) {
			console.log(
				`[imap-auth] api rejected key for ${address}: HTTP ${response.status} (key ${apiKey.length} chars, starts ${apiKey.slice(0, 4)}...)`,
			);
			return null;
		}

		const body = (await response.json()) as { data?: DomainRow[] };
		const match = (body.data ?? []).find(
			(row) =>
				row.status === "verified" &&
				(domain === row.domain || domain.endsWith(`.${row.domain}`)),
		);
		if (!match) {
			console.log(
				`[imap-auth] key valid but domain ${domain} not among ${body.data?.length ?? 0} account domains for ${address}`,
			);
			return null;
		}

		this.cache.set(cacheKey, {
			expires: Date.now() + CACHE_TTL_MS,
			userId: match.userId,
		});
		return { userId: match.userId };
	}
}
