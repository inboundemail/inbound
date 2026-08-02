import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";

export const SESSION_COOKIE = "inbound_mail_session";

export interface StoredInboundSession extends JWTPayload {
	accessToken: string;
	refreshToken?: string;
	expiresAt: number;
	user: {
		id: string;
		name: string;
		email: string;
		image?: string | null;
	};
	domainScope: {
		mode: "all" | "selected";
		domains: Array<{ id: string; domain: string }>;
	};
}

async function sessionKey(): Promise<Uint8Array> {
	const secret = process.env.INBOUND_MAIL_SESSION_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error("INBOUND_MAIL_SESSION_SECRET must be at least 32 characters");
	}

	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(secret),
	);
	return new Uint8Array(digest);
}

export async function sealInboundSession(
	session: StoredInboundSession,
): Promise<string> {
	return new EncryptJWT(session)
		.setProtectedHeader({ alg: "dir", enc: "A256GCM" })
		.setIssuedAt()
		.setExpirationTime("30d")
		.encrypt(await sessionKey());
}

export async function unsealInboundSession(
	value: string | undefined,
): Promise<StoredInboundSession | null> {
	if (!value) return null;
	try {
		const { payload } = await jwtDecrypt(value, await sessionKey());
		return payload as StoredInboundSession;
	} catch {
		return null;
	}
}

export function sessionCookieOptions() {
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax" as const,
		path: "/",
		maxAge: 60 * 60 * 24 * 30,
	};
}
