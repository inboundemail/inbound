import { Buffer } from "node:buffer";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const HEX_SHA1 = /^[0-9a-f]{40}$/i;

export function verifyVercelSignature(
	body: Uint8Array,
	header: string | null,
	secret: string | undefined,
): boolean {
	if (!secret || !header) return false;
	const candidate = header.trim();
	if (!HEX_SHA1.test(candidate)) return false;
	const expected = createHmac("sha1", secret).update(body).digest();
	return timingSafeEqual(expected, Buffer.from(candidate, "hex"));
}

export function safeEqual(a: string, b: string): boolean {
	const ha = createHash("sha256").update(a).digest();
	const hb = createHash("sha256").update(b).digest();
	return timingSafeEqual(ha, hb);
}

export function hmacHex(key: string, value: string, length: number): string {
	return createHmac("sha256", key).update(value).digest("hex").slice(0, length);
}

export function bearerToken(request: Request): string | null {
	const header = request.headers.get("authorization");
	if (!header) return null;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match ? match[1].trim() : null;
}
