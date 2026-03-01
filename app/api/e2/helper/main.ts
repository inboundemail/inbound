"use server";

import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/auth-schema";
import { sentEmails } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Warmup limits for new accounts (first 7 days)
const NEW_ACCOUNT_WARMUP_DAYS = 7;
const NEW_ACCOUNT_DAILY_LIMIT = 100;

// Initialize Upstash Redis client for rate limiting
let redis: Redis | null = null;
let ratelimit: Ratelimit | null = null;

if (
	process.env.UPSTASH_REDIS_REST_URL &&
	process.env.UPSTASH_REDIS_REST_TOKEN
) {
	redis = new Redis({
		url: process.env.UPSTASH_REDIS_REST_URL,
		token: process.env.UPSTASH_REDIS_REST_TOKEN,
	});

	// Rate limiter: 4 requests per second per account
	ratelimit = new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(4, "1 s"),
		analytics: true,
		prefix: "v2:ratelimit",
	});
} else {
	console.warn(
		"⚠️ Upstash Redis not configured. Rate limiting will be disabled for V2 API.",
	);
}

export async function validateRequest(request: NextRequest) {
	try {
		// Get client IP from various headers (Vercel/Cloudflare/etc)
		const clientIp =
			request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
			request.headers.get("x-real-ip") ||
			request.headers.get("cf-connecting-ip") ||
			"unknown";
		console.log("🌐 [V2] Client IP:", clientIp);

		let userId: string | undefined;

		// Try session auth first
		const session = await auth.api.getSession({
			headers: await headers(),
		});

		if (session?.user?.id) {
			userId = session.user.id;
			console.log("🔑 [V2] Auth Type: SESSION");
			console.log("✅ Authenticated via session:", userId);
		}

		// If no session, try API key auth
		if (!userId) {
			const apiKey = request.headers
				.get("Authorization")
				?.replace("Bearer ", "");

			if (apiKey) {
			const apiKeyResult = (await (auth.api as any).verifyApiKey({
				body: {
					key: apiKey,
				},
			})) as { valid: boolean; key?: { referenceId: string } } | null;

			if (apiKeyResult?.key?.referenceId) {
				userId = apiKeyResult.key.referenceId;
					console.log("🔑 [V2] Auth Type: API_KEY");
					console.log("🔑 [V2] API Key:", apiKey);
					console.log("✅ Authenticated via API key:", userId);
				}
			}
		}

		if (!userId) {
			return { error: "Unauthorized" };
		}

		// Check if user exists and is banned
		const [userRecord] = await db
			.select({
				banned: user.banned,
				banReason: user.banReason,
				banExpires: user.banExpires,
			})
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);

		// User must exist in database
		if (!userRecord) {
			console.log(`❌ User ${userId} not found in database`);
			return { error: "User not found" };
		}

		// Check if user is banned
		if (userRecord.banned) {
			// Check if ban has expired
			if (
				userRecord.banExpires &&
				new Date(userRecord.banExpires) < new Date()
			) {
				// Ban has expired, allow through (could also auto-unban here)
				console.log(`🔓 User ${userId} ban has expired, allowing request`);
			} else {
				console.log(
					`🚫 Blocked banned user ${userId} from API access. Reason: ${userRecord.banReason}`,
				);
				return {
					error: "Account suspended",
					banReason:
						userRecord.banReason ||
						"Your account has been suspended. Please contact support.",
				};
			}
		}

		// Check rate limit for this userId (if configured)
		if (ratelimit) {
			const { success, limit, remaining, reset } =
				await ratelimit.limit(userId);

			console.log("📊 Rate limit check:", {
				success,
				limit,
				remaining,
				reset: new Date(reset).toISOString(),
			});

			if (!success) {
				console.log(`⚠️ Rate limit exceeded for userId: ${userId}`);
				return { error: "Rate limit exceeded" };
			}
		} else {
			console.log("⚠️ Rate limiting disabled (Upstash not configured)");
		}

		return { userId };
	} catch (error) {
		console.error("Error validating request: " + error);
		return { error: "Unauthorized" };
	}
}

/**
 * Check if a new account has exceeded their warmup period daily limits
 * New accounts (< 7 days old) are limited to 100 emails/day
 *
 * @param userId - The user ID to check
 * @returns Object with allowed status and details
 */
export async function checkNewAccountWarmupLimits(userId: string): Promise<{
	allowed: boolean;
	error?: string;
	isInWarmup: boolean;
	emailsSentToday: number;
	dailyLimit: number;
	daysRemaining?: number;
}> {
	try {
		// Get user's created_at date
		const [userRecord] = await db
			.select({
				createdAt: user.createdAt,
			})
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);

		if (!userRecord) {
			return {
				allowed: false,
				error: "User not found",
				isInWarmup: false,
				emailsSentToday: 0,
				dailyLimit: NEW_ACCOUNT_DAILY_LIMIT,
			};
		}

		const accountAgeMs = Date.now() - new Date(userRecord.createdAt).getTime();
		const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

		// If account is older than warmup period, no limits apply
		if (accountAgeDays >= NEW_ACCOUNT_WARMUP_DAYS) {
			return {
				allowed: true,
				isInWarmup: false,
				emailsSentToday: 0,
				dailyLimit: Infinity,
			};
		}

		// Account is in warmup period - check today's email count (UTC)
		const todayStart = new Date();
		todayStart.setUTCHours(0, 0, 0, 0);

		const [emailCount] = await db
			.select({
				count: sql<number>`count(*)::int`,
			})
			.from(sentEmails)
			.where(
				and(
					eq(sentEmails.userId, userId),
					gte(sentEmails.createdAt, todayStart),
				),
			);

		const emailsSentToday = emailCount?.count || 0;
		const daysRemaining = Math.ceil(NEW_ACCOUNT_WARMUP_DAYS - accountAgeDays);

		if (emailsSentToday >= NEW_ACCOUNT_DAILY_LIMIT) {
			console.log(
				`🚫 New account warmup limit reached: User ${userId} has sent ${emailsSentToday}/${NEW_ACCOUNT_DAILY_LIMIT} emails today (${daysRemaining} days remaining in warmup)`,
			);
			return {
				allowed: false,
				error: `New account limit reached. You can send up to ${NEW_ACCOUNT_DAILY_LIMIT} emails per day during your first ${NEW_ACCOUNT_WARMUP_DAYS} days. Your limit resets at midnight UTC. ${daysRemaining} day(s) remaining in warmup period.`,
				isInWarmup: true,
				emailsSentToday,
				dailyLimit: NEW_ACCOUNT_DAILY_LIMIT,
				daysRemaining,
			};
		}

		console.log(
			`✅ New account warmup check passed: User ${userId} has sent ${emailsSentToday}/${NEW_ACCOUNT_DAILY_LIMIT} emails today (${daysRemaining} days remaining in warmup)`,
		);
		return {
			allowed: true,
			isInWarmup: true,
			emailsSentToday,
			dailyLimit: NEW_ACCOUNT_DAILY_LIMIT,
			daysRemaining,
		};
	} catch (error) {
		console.error("Error checking warmup limits:", error);
		// On error, allow the request (fail open) but log it
		return {
			allowed: true,
			isInWarmup: false,
			emailsSentToday: 0,
			dailyLimit: NEW_ACCOUNT_DAILY_LIMIT,
		};
	}
}
