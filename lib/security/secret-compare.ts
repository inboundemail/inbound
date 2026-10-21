import { createHash, timingSafeEqual } from "node:crypto";

export function secretsEqual(expected: string, provided: string): boolean {
	const expectedDigest = createHash("sha256").update(expected).digest();
	const providedDigest = createHash("sha256").update(provided).digest();
	return timingSafeEqual(expectedDigest, providedDigest);
}
