import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { apikey, user } from "@/lib/db/auth-schema";

// Initialize Upstash Redis client for rate limiting
// Only initialize if env vars are present
let redis: Redis | null = null;
let ratelimit: Ratelimit | null = null;
let mailboxLoginRatelimit: Ratelimit | null = null;
let mailboxIpRatelimit: Ratelimit | null = null;

// SECURITY: Controls fail-closed behavior when rate limiting is unavailable
// Set to "true" ONLY in development environments
// Production should ALWAYS fail closed (default behavior)
const ALLOW_REQUESTS_WITHOUT_RATE_LIMIT =
	process.env.ALLOW_REQUESTS_WITHOUT_RATE_LIMIT === "true";

if (
	process.env.UPSTASH_REDIS_REST_URL &&
	process.env.UPSTASH_REDIS_REST_TOKEN
) {
	redis = new Redis({
		url: process.env.UPSTASH_REDIS_REST_URL,
		token: process.env.UPSTASH_REDIS_REST_TOKEN,
	});

	// Rate limiter: 10 requests per second per account
	ratelimit = new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(10, "1 s"),
		analytics: true,
		prefix: "e2:ratelimit",
	});
	mailboxLoginRatelimit = new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(60, "1 m"),
		analytics: true,
		prefix: "e2:mailbox-auth:login",
	});
	mailboxIpRatelimit = new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(3000, "1 m"),
		analytics: true,
		prefix: "e2:mailbox-auth:ip",
	});
} else {
	if (ALLOW_REQUESTS_WITHOUT_RATE_LIMIT) {
		console.warn(
			"⚠️ [DEV MODE] Upstash Redis not configured. Rate limiting disabled via ALLOW_REQUESTS_WITHOUT_RATE_LIMIT=true",
		);
	} else {
		console.error(
			"🚨 CRITICAL: Upstash Redis not configured. API will reject requests to protected endpoints (fail-closed). Set ALLOW_REQUESTS_WITHOUT_RATE_LIMIT=true for development only.",
		);
	}
}

/**
 * RFC-compliant error response structure
 * Follows RFC 7807: Problem Details for HTTP APIs
 */
export interface RFCErrorResponse {
	error: string;
	message: string;
	statusCode: number;
}

/**
 * Custom error class for authentication failures with RFC-compliant headers
 */
export class AuthError extends Error {
	constructor(
		public readonly response: RFCErrorResponse,
		public readonly headers: Record<string, string>,
	) {
		super(response.message);
		this.name = "AuthError";
	}
}

function maskApiKey(apiKey: string) {
	if (apiKey.length <= 12) {
		return "[redacted]";
	}

	return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
}

function getHeaderRecord(headers: unknown): Record<string, string> {
	if (headers && typeof headers === "object" && !Array.isArray(headers)) {
		return headers as Record<string, string>;
	}

	return {};
}

function getClientIp(request: Request): string {
	return (
		request.headers
			.get("x-vercel-forwarded-for")
			?.split(",")[0]
			?.trim()
			.toLowerCase() ||
		request.headers.get("cf-connecting-ip")?.trim().toLowerCase() ||
		request.headers.get("x-real-ip")?.trim().toLowerCase() ||
		request.headers
			.get("x-forwarded-for")
			?.split(",")[0]
			?.trim()
			.toLowerCase() ||
		"unknown"
	);
}

export async function enforceAuthenticatedUserAndRateLimit(
	userId: string,
	set: { status?: number | string; headers?: unknown },
): Promise<void> {
	const [userRecord] = await db
		.select({
			banned: user.banned,
			banReason: user.banReason,
			banExpires: user.banExpires,
		})
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);

	if (!userRecord) {
		set.status = 401;
		const userNotFoundHeaders = {
			...getHeaderRecord(set.headers),
			"WWW-Authenticate": 'Bearer realm="API", charset="UTF-8"',
			"Content-Type": "application/json; charset=utf-8",
		};
		set.headers = userNotFoundHeaders;
		throw new AuthError(
			{
				error: "Unauthorized",
				message: "User not found.",
				statusCode: 401,
			},
			userNotFoundHeaders,
		);
	}

	if (userRecord.banned) {
		const banExpiresAt = userRecord.banExpires
			? new Date(userRecord.banExpires)
			: null;
		const banStillActive = banExpiresAt
			? banExpiresAt.getTime() >= Date.now()
			: true;

		if (banStillActive) {
			set.status = 403;
			const bannedHeaders = {
				...getHeaderRecord(set.headers),
				"Content-Type": "application/json; charset=utf-8",
			};
			set.headers = bannedHeaders;
			throw new AuthError(
				{
					error: "Forbidden",
					message:
						userRecord.banReason ||
						"Account suspended. Please contact support.",
					statusCode: 403,
				},
				bannedHeaders,
			);
		}
	}

	if (ratelimit) {
		let rateLimitResult: Awaited<ReturnType<typeof ratelimit.limit>>;

		try {
			rateLimitResult = await ratelimit.limit(userId);
		} catch (error) {
			console.error("🚨 Rate limiting service failure:", error);
			set.status = 503;
			const unavailableHeaders = {
				"Content-Type": "application/json; charset=utf-8",
				"Retry-After": "60",
			};
			set.headers = unavailableHeaders;
			throw new AuthError(
				{
					error: "Service Unavailable",
					message:
						"Rate limiting service is temporarily unavailable. Please try again later.",
					statusCode: 503,
				},
				unavailableHeaders,
			);
		}

		const {
			success: rateLimitSuccess,
			limit,
			remaining,
			reset,
		} = rateLimitResult;

		console.log("📊 Rate limit check:", {
			success: rateLimitSuccess,
			limit,
			remaining,
			reset: new Date(reset).toISOString(),
		});

		set.headers = {
			...getHeaderRecord(set.headers),
			"X-RateLimit-Limit": limit.toString(),
			"X-RateLimit-Remaining": remaining.toString(),
			"X-RateLimit-Reset": reset.toString(),
		};

		if (!rateLimitSuccess) {
			console.log("⚠️ Rate limit exceeded for userId:", userId);
			const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000);
			set.status = 429;
			const rateLimitHeaders = {
				...getHeaderRecord(set.headers),
				"Retry-After": retryAfterSeconds.toString(),
				"Content-Type": "application/json; charset=utf-8",
			};
			set.headers = rateLimitHeaders;
			throw new AuthError(
				{
					error: "Too Many Requests",
					message: `Rate limit exceeded. Maximum ${limit} requests per second. Retry after ${retryAfterSeconds} seconds.`,
					statusCode: 429,
				},
				rateLimitHeaders,
			);
		}
	} else {
		if (!ALLOW_REQUESTS_WITHOUT_RATE_LIMIT) {
			console.error(
				"🚨 SECURITY: Blocking request - rate limiting unavailable and ALLOW_REQUESTS_WITHOUT_RATE_LIMIT is not enabled",
			);
			set.status = 503;
			const unavailableHeaders = {
				"Content-Type": "application/json; charset=utf-8",
				"Retry-After": "60",
			};
			set.headers = unavailableHeaders;
			throw new AuthError(
				{
					error: "Service Unavailable",
					message:
						"Rate limiting service is temporarily unavailable. Please try again later.",
					statusCode: 503,
				},
				unavailableHeaders,
			);
		}
		console.warn(
			"⚠️ [DEV MODE] Rate limiting bypassed - ALLOW_REQUESTS_WITHOUT_RATE_LIMIT=true",
		);
	}
}

export async function enforceMailboxAuthenticationRateLimit(
	request: Request,
	loginAddress: string,
	set: { status?: number | string; headers?: unknown },
): Promise<void> {
	if (!mailboxLoginRatelimit || !mailboxIpRatelimit) {
		if (ALLOW_REQUESTS_WITHOUT_RATE_LIMIT) return;

		set.status = 503;
		const headers = {
			"Content-Type": "application/json; charset=utf-8",
			"Retry-After": "60",
		};
		set.headers = headers;
		throw new AuthError(
			{
				error: "Service Unavailable",
				message:
					"Rate limiting service is temporarily unavailable. Please try again later.",
				statusCode: 503,
			},
			headers,
		);
	}

	const clientIp = getClientIp(request);
	const normalizedLoginAddress = loginAddress.trim().toLowerCase();
	let results: Awaited<ReturnType<typeof mailboxLoginRatelimit.limit>>[];
	try {
		results = await Promise.all([
			mailboxLoginRatelimit.limit(`${clientIp}:${normalizedLoginAddress}`),
			mailboxIpRatelimit.limit(clientIp),
		]);
	} catch (error) {
		console.error("Mailbox authentication rate limiting service failure:", error);
		set.status = 503;
		const headers = {
			"Content-Type": "application/json; charset=utf-8",
			"Retry-After": "60",
		};
		set.headers = headers;
		throw new AuthError(
			{
				error: "Service Unavailable",
				message:
					"Rate limiting service is temporarily unavailable. Please try again later.",
				statusCode: 503,
			},
			headers,
		);
	}

	const result = results.find(({ success }) => !success) ?? results[0];
	set.headers = {
		...getHeaderRecord(set.headers),
		"X-RateLimit-Limit": result.limit.toString(),
		"X-RateLimit-Remaining": result.remaining.toString(),
		"X-RateLimit-Reset": result.reset.toString(),
	};

	if (!result.success) {
		const retryAfterSeconds = Math.max(
			1,
			Math.ceil((result.reset - Date.now()) / 1000),
		);
		set.status = 429;
		const headers = {
			...getHeaderRecord(set.headers),
			"Retry-After": retryAfterSeconds.toString(),
			"Content-Type": "application/json; charset=utf-8",
		};
		set.headers = headers;
		throw new AuthError(
			{
				error: "Too Many Requests",
				message: "Too many authentication attempts. Please try again later.",
				statusCode: 429,
			},
			headers,
		);
	}
}

/**
 * Validates authentication (session or API key) and checks rate limits
 * Throws AuthError with RFC-compliant headers on failure
 *
 * RFC Compliance:
 * - RFC 7235: WWW-Authenticate header for 401 responses
 * - RFC 6585: Retry-After header for 429 responses
 * - RFC 7231: Standard HTTP status codes
 * - RFC 7807: Problem Details for HTTP APIs (error format)
 *
 * @param request - Standard Request object (from Elysia context)
 * @param set - Elysia's set object for setting response status and headers
 * @returns userId on success
 * @throws AuthError with appropriate status code and RFC-compliant headers on failure
 */
export async function validateAndRateLimit(
	request: Request,
	set: {
		status?: number | string;
		headers?: unknown;
	},
): Promise<string> {
	try {
		// Get client IP from various headers (Vercel/Cloudflare/etc)
		const clientIp = getClientIp(request);
		console.log("🌐 [E2] Client IP:", clientIp);
		console.log("🔐 Validating request authentication and rate limit");

		// Get session from Better Auth using the request headers directly
		// Using request.headers instead of Next.js headers() to avoid race conditions
		// in the Elysia context where headers() might not always be properly populated
		const sessionHeaders = new Headers(request.headers);
		sessionHeaders.delete("authorization");
		const session = await auth.api.getSession({ headers: sessionHeaders });

		// Get API key from Authorization header
		const authorization = request.headers.get("authorization");
		const apiKey = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";

		// Verify API key if provided
		const authApi = auth.api as {
			verifyApiKey?: (input: {
				body: { key: string; configId: string };
			}) => Promise<{
				valid: boolean;
				error?: { message?: string } | null;
				key?: {
					id?: string | null;
					userId?: string | null;
					referenceId?: string | null;
				} | null;
			}>;
		};

		const apiSession =
			apiKey && authApi.verifyApiKey
				? await authApi.verifyApiKey({
						body: {
							key: apiKey,
							configId: "default",
						},
					})
				: null;

		let apiKeyUserId: string | null = null;
		if (apiSession?.valid && !apiSession.error && apiSession.key) {
			const verifiedKey = apiSession.key as {
				id?: string | null;
				userId?: string | null;
				referenceId?: string | null;
			};

			apiKeyUserId = verifiedKey.userId ?? verifiedKey.referenceId ?? null;

			if (!apiKeyUserId && verifiedKey.id) {
				const [apiKeyRecord] = await db
					.select({
						referenceId: apikey.referenceId,
						userId: apikey.userId,
					})
					.from(apikey)
					.where(eq(apikey.id, verifiedKey.id))
					.limit(1);

				apiKeyUserId =
					apiKeyRecord?.referenceId ?? apiKeyRecord?.userId ?? null;
			}
		}

		// Determine userId from either session or API key
		let userId: string;

		if (session?.user?.id) {
			userId = session.user.id;
			console.log("🔑 [E2] Auth Type: SESSION");
			console.log("✅ Session authentication successful for userId:", userId);
		} else if (apiSession?.valid && !apiSession?.error && apiKeyUserId) {
			userId = apiKeyUserId;
			console.log("🔑 [E2] Auth Type: API_KEY");
			console.log("🔑 [E2] API Key:", maskApiKey(apiKey));
			console.log("✅ API key authentication successful for userId:", userId);
		} else {
			console.log("❌ Authentication failed: No valid session or API key");
			// RFC 7235: 401 responses MUST include WWW-Authenticate header
			set.status = 401;
			const unauthorizedHeaders = {
				"WWW-Authenticate": 'Bearer realm="API", charset="UTF-8"',
				"Content-Type": "application/json; charset=utf-8",
			};
			set.headers = unauthorizedHeaders;
			throw new AuthError(
				{
					error: "Unauthorized",
					message:
						"Authentication required. Provide a valid session cookie or Bearer token.",
					statusCode: 401,
				},
				unauthorizedHeaders,
			);
		}

		await enforceAuthenticatedUserAndRateLimit(userId, set);

		return userId;
	} catch (error) {
		console.error("❌ Error validating request:", error);
		// Re-throw AuthError as-is (already has proper headers)
		if (error instanceof AuthError) {
			throw error;
		}
		// For unexpected errors, set unauthorized status with proper headers
		set.status = 401;
		const errorHeaders = {
			"WWW-Authenticate": 'Bearer realm="API", charset="UTF-8"',
			"Content-Type": "application/json; charset=utf-8",
		};
		set.headers = errorHeaders;
		throw new AuthError(
			{
				error: "Unauthorized",
				message: "An error occurred during authentication.",
				statusCode: 401,
			},
			errorHeaders,
		);
	}
}
