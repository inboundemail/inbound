import { isIPv4, isIPv6 } from "node:net";

export const MAX_ALLOWED_IPS = 100;

interface ParsedNetwork {
	bytes: number[];
	prefix: number;
}

function ipv4Bytes(value: string): number[] | null {
	if (!isIPv4(value)) return null;
	return value.split(".").map((part) => Number.parseInt(part, 10));
}

function ipv6Bytes(value: string): number[] | null {
	if (!isIPv6(value) || value.includes("%")) return null;
	let address = value;
	let tail: number[] = [];
	const lastColon = address.lastIndexOf(":");
	const dotted = address.slice(lastColon + 1);
	if (dotted.includes(".")) {
		const v4 = ipv4Bytes(dotted);
		if (!v4) return null;
		tail = v4;
		address = `${address.slice(0, lastColon + 1)}0:0`;
	}
	const [head, rest] = address.includes("::")
		? address.split("::")
		: [address, null];
	const headGroups = head ? head.split(":") : [];
	const restGroups = rest ? rest.split(":") : [];
	const missing = 8 - headGroups.length - restGroups.length;
	if (rest === null ? missing !== 0 : missing < 1) return null;
	const groups = [
		...headGroups,
		...Array<string>(rest === null ? 0 : missing).fill("0"),
		...restGroups,
	];
	const bytes: number[] = [];
	for (const group of groups) {
		const parsed = Number.parseInt(group, 16);
		if (!/^[0-9a-f]{1,4}$/i.test(group) || Number.isNaN(parsed)) return null;
		bytes.push(parsed >> 8, parsed & 0xff);
	}
	if (tail.length === 4) bytes.splice(12, 4, ...tail);
	return bytes;
}

function ipBytes(value: string): number[] | null {
	return ipv4Bytes(value) ?? ipv6Bytes(value);
}

function mappedIpv4(bytes: number[]): number[] | null {
	if (bytes.length !== 16) return null;
	for (let i = 0; i < 10; i++) if (bytes[i] !== 0) return null;
	if (bytes[10] !== 0xff || bytes[11] !== 0xff) return null;
	return bytes.slice(12);
}

function maskBytes(bytes: number[], prefix: number): number[] {
	return bytes.map((byte, index) => {
		const bits = Math.min(Math.max(prefix - index * 8, 0), 8);
		return byte & ((0xff << (8 - bits)) & 0xff);
	});
}

function formatNetwork({ bytes, prefix }: ParsedNetwork): string {
	if (bytes.length === 4) return `${bytes.join(".")}/${prefix}`;
	const groups: number[] = [];
	for (let i = 0; i < 16; i += 2) groups.push((bytes[i] << 8) | bytes[i + 1]);
	let bestStart = -1;
	let bestLength = 0;
	for (let i = 0; i < 8; ) {
		if (groups[i] !== 0) {
			i++;
			continue;
		}
		let j = i;
		while (j < 8 && groups[j] === 0) j++;
		if (j - i > bestLength && j - i > 1) {
			bestStart = i;
			bestLength = j - i;
		}
		i = j;
	}
	const hex = groups.map((group) => group.toString(16));
	const text =
		bestStart < 0
			? hex.join(":")
			: `${hex.slice(0, bestStart).join(":")}::${hex.slice(bestStart + bestLength).join(":")}`;
	return `${text}/${prefix}`;
}

function parseNetwork(value: string): ParsedNetwork | null {
	const trimmed = value.trim().toLowerCase();
	const slash = trimmed.indexOf("/");
	const address = slash < 0 ? trimmed : trimmed.slice(0, slash);
	let bytes = ipBytes(address);
	if (!bytes) return null;
	let prefix = bytes.length * 8;
	if (slash >= 0) {
		const prefixText = trimmed.slice(slash + 1);
		if (!/^\d{1,3}$/.test(prefixText)) return null;
		prefix = Number.parseInt(prefixText, 10);
		if (prefix > bytes.length * 8) return null;
	}
	const mapped = mappedIpv4(bytes);
	if (mapped && prefix >= 96) {
		bytes = mapped;
		prefix -= 96;
	}
	return { bytes: maskBytes(bytes, prefix), prefix };
}

/**
 * Validates and normalizes an allowlist of IPv4/IPv6 addresses and CIDR
 * ranges. Bare addresses become /32 or /128, host bits are cleared and
 * duplicates removed. An empty list means unrestricted and is stored as null.
 */
export function normalizeAllowedIps(
	values: string[] | null | undefined,
): { value: string[] | null } | { error: string } {
	if (!values || values.length === 0) return { value: null };
	if (values.length > MAX_ALLOWED_IPS) {
		return { error: `At most ${MAX_ALLOWED_IPS} allowed IP ranges` };
	}
	const normalized: string[] = [];
	for (const value of values) {
		const network = parseNetwork(value);
		if (!network) {
			return {
				error: `Invalid IP address or CIDR range: ${value.slice(0, 64)}`,
			};
		}
		const formatted = formatNetwork(network);
		if (!normalized.includes(formatted)) normalized.push(formatted);
	}
	return { value: normalized };
}

/**
 * Whether a client IP may use a credential with this allowlist. A null or
 * empty list is unrestricted; otherwise an unknown or unparsable client IP is
 * refused. IPv4-mapped IPv6 addresses match IPv4 ranges.
 */
export function ipAllowed(
	allowedIps: string[] | null | undefined,
	clientIp: string | null | undefined,
): boolean {
	if (!allowedIps || allowedIps.length === 0) return true;
	if (!clientIp) return false;
	let bytes = ipBytes(clientIp.trim().toLowerCase());
	if (!bytes) return false;
	bytes = mappedIpv4(bytes) ?? bytes;
	for (const entry of allowedIps) {
		const network = parseNetwork(entry);
		if (!network || network.bytes.length !== bytes.length) continue;
		const masked = maskBytes(bytes, network.prefix);
		if (masked.every((byte, index) => byte === network.bytes[index])) {
			return true;
		}
	}
	return false;
}
