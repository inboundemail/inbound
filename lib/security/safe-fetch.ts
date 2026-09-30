import { type LookupAddress, lookup as dnsLookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, buildConnector, fetch as undiciFetch } from "undici";

/**
 * Fetch for user-supplied URLs (webhooks, attachment `path`s).
 *
 * The destination is checked when the socket connects, after DNS resolution and
 * again for every redirect hop, so hostnames that resolve to internal addresses
 * (e.g. *.localtest.me, DNS rebinding) and redirects to them are refused.
 */

export class BlockedDestinationError extends Error {
	constructor(host: string) {
		super(`Destination ${host} resolves to a private or reserved address`);
		this.name = "BlockedDestinationError";
	}
}

// Separate lists: a BlockList also matches IPv4 addresses against IPv6 rules
// (as ::ffff:a.b.c.d), which the IPv6 ranges below would cover.
const nonPublicV4 = new BlockList();
const nonPublicV6 = new BlockList();
for (const [network, prefix] of [
	["0.0.0.0", 8], // "this" network
	["10.0.0.0", 8], // private
	["100.64.0.0", 10], // carrier-grade NAT
	["127.0.0.0", 8], // loopback
	["169.254.0.0", 16], // link-local, cloud metadata
	["172.16.0.0", 12], // private
	["192.0.0.0", 24], // IETF protocol assignments
	["192.0.2.0", 24], // documentation
	["192.88.99.0", 24], // 6to4 relay
	["192.168.0.0", 16], // private
	["198.18.0.0", 15], // benchmarking
	["198.51.100.0", 24], // documentation
	["203.0.113.0", 24], // documentation
	["224.0.0.0", 4], // multicast
	["240.0.0.0", 4], // reserved, broadcast
] as const) {
	nonPublicV4.addSubnet(network, prefix, "ipv4");
}
// IPv6: only global unicast (2000::/3) is public. Everything else — loopback,
// IPv4-mapped/NAT64, unique-local, link-local, multicast — falls outside it.
for (const [network, prefix] of [
	["::", 3],
	["4000::", 2],
	["8000::", 1],
	["2001::", 32], // Teredo
	["2001:db8::", 32], // documentation
	["2002::", 16], // 6to4 (embeds an IPv4 address)
] as const) {
	nonPublicV6.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
	const ip = address.replace(/^\[|\]$/g, "");
	const family = isIP(ip);
	if (family === 0) return false;
	return family === 4
		? !nonPublicV4.check(ip, "ipv4")
		: !nonPublicV6.check(ip, "ipv6");
}

/** Local dev (`bun run dev:local`) delivers webhooks to *.localtest.me. */
function allowPrivateDestinations(): boolean {
	return (
		process.env.INBOUND_LOCAL_DEV === "true" &&
		process.env.NODE_ENV !== "production"
	);
}

type LookupCallback = (
	err: NodeJS.ErrnoException | null,
	address: string | LookupAddress[],
	family?: number,
) => void;

function publicOnlyLookup(
	hostname: string,
	options: { all?: boolean },
	callback: LookupCallback,
): void {
	dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
		if (err) return callback(err, "");
		if (
			addresses.length === 0 ||
			addresses.some(({ address }) => !isPublicAddress(address))
		) {
			return callback(new BlockedDestinationError(hostname), "");
		}
		if (options.all) return callback(null, addresses);
		callback(null, addresses[0].address, addresses[0].family);
	});
}

const connect = buildConnector({ lookup: publicOnlyLookup } as never);

const publicOnlyAgent = new Agent({
	connect(options, callback) {
		// IP literals never reach the lookup function.
		const host = options.hostname.replace(/^\[|\]$/g, "");
		if (isIP(host) && !isPublicAddress(host)) {
			callback(new BlockedDestinationError(options.hostname), null);
			return;
		}
		connect(options, callback);
	},
});

async function assertPublicHostname(hostname: string): Promise<void> {
	const host = hostname.replace(/^\[|\]$/g, "");
	if (isIP(host)) {
		if (!isPublicAddress(host)) throw new BlockedDestinationError(hostname);
		return;
	}
	await new Promise<void>((resolve, reject) =>
		publicOnlyLookup(host, { all: true }, (err) =>
			err ? reject(err) : resolve(),
		),
	);
}

export async function safeFetch(
	input: string | URL,
	init: RequestInit = {},
): Promise<Response> {
	const url = new URL(input);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Only http and https URLs are allowed");
	}
	if (allowPrivateDestinations()) return fetch(url, init);

	if (process.versions.bun) {
		// Bun's undici shim ignores dispatchers; resolve up front and refuse redirects.
		await assertPublicHostname(url.hostname);
		return fetch(url, { ...init, redirect: "manual" });
	}

	try {
		return (await undiciFetch(url, {
			...(init as object),
			dispatcher: publicOnlyAgent,
		})) as unknown as Response;
	} catch (error) {
		// undici wraps connection errors in `TypeError: fetch failed`.
		const cause = (error as { cause?: unknown })?.cause;
		if (cause instanceof BlockedDestinationError) throw cause;
		throw error;
	}
}

/** Read at most `maxBytes` of a response body as text, then stop downloading. */
export async function readTextLimited(
	response: Response,
	maxBytes = 64 * 1024,
): Promise<string> {
	const bytes = await readBytesLimited(response, maxBytes, false);
	return new TextDecoder().decode(bytes);
}

/**
 * Read a response body into memory, stopping at `maxBytes`. With `strict`, a
 * larger body throws instead of being truncated.
 */
export async function readBytesLimited(
	response: Response,
	maxBytes: number,
	strict = true,
): Promise<Uint8Array> {
	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (total <= maxBytes) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
			total += value.byteLength;
		}
	} finally {
		reader.cancel().catch(() => {});
	}
	if (strict && total > maxBytes) {
		throw new Error(`Response body exceeds ${maxBytes} bytes`);
	}
	const out = new Uint8Array(Math.min(total, maxBytes));
	let offset = 0;
	for (const chunk of chunks) {
		const slice = chunk.subarray(0, out.byteLength - offset);
		out.set(slice, offset);
		offset += slice.byteLength;
		if (offset >= out.byteLength) break;
	}
	return out;
}
