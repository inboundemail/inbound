"use server"

import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { Redis } from '@upstash/redis';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Redis client for rate limiting
const redis = Redis.fromEnv();

export interface RateLimitHeaders {
    'ratelimit-limit': string;
    'ratelimit-remaining': string; 
    'ratelimit-reset': string;
    'retry-after'?: string;
}

export interface ValidateRequestSuccess {
    userId: string;
    rateLimitHeaders: RateLimitHeaders;
}

/**
 * Check if user has rate limit override in feature flags
 */
async function hasRateLimitOverride(userId: string): Promise<boolean> {
    try {
        const userRecord = await db
            .select({ featureFlags: user.featureFlags })
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);
        
        if (userRecord.length === 0) return false;
        
        const flags = userRecord[0].featureFlags;
        if (!flags) return false;
        
        const featureFlags = JSON.parse(flags);
        return Array.isArray(featureFlags) && featureFlags.includes('rateLimitOverride');
    } catch (error) {
        console.error('Error checking rate limit override:', error);
        return false; // Fail closed - apply rate limits if we can't check
    }
}

/**
 * Check rate limit using Redis (2 requests per second, Resend-style)
 */
async function checkRateLimit(userId: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
}> {
    const now = Math.floor(Date.now() / 1000);
    const currentSecond = now;
    const rateLimitKey = `rate_limit:${userId}:${currentSecond}`;
    const prevSecondKey = `rate_limit:${userId}:${currentSecond - 1}`;
    
    try {
        // Get current second count and previous second count
        const [currentCount, prevCount] = await Promise.all([
            redis.incr(rateLimitKey),
            redis.get(prevSecondKey)
        ]);
        
        // Set expiration for current second key (2 seconds to handle edge cases)
        await redis.expire(rateLimitKey, 2);
        
        // Total requests in last 2 seconds (current + previous)
        const totalRequests = currentCount + (prevCount ? parseInt(prevCount as string) : 0);
        
        // Resend limit: 2 requests per second
        const limit = 2;
        const remaining = Math.max(0, limit - currentCount);
        const resetTime = currentSecond + 1;
        
        if (totalRequests > limit) {
            return {
                allowed: false,
                remaining: 0,
                resetTime,
                retryAfter: 1
            };
        }
        
        return {
            allowed: true,
            remaining,
            resetTime
        };
        
    } catch (error) {
        console.error('Rate limit check error:', error);
        // Fail open - allow request if Redis is down
        return {
            allowed: true,
            remaining: 1,
            resetTime: now + 1
        };
    }
}

export async function validateRequest(request: NextRequest): Promise<ValidateRequestSuccess | NextResponse> {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        })

        const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '') || ""

        const apiSession = await auth.api.verifyApiKey({
            body: {
                key: apiKey
            }
        })

        // Check if either session or API key provides a valid userId
        let userId: string | undefined;
        if (session?.user?.id) {
            userId = session.user.id;
        } else if (apiSession?.key?.userId) {
            userId = apiSession.key.userId;
        }

        if (!userId) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Check rate limit override first
        const hasOverride = await hasRateLimitOverride(userId);
        if (hasOverride) {
            console.log(`✅ Rate limit override active for user: ${userId}`);
            return { 
                userId,
                rateLimitHeaders: {
                    'ratelimit-limit': 'unlimited',
                    'ratelimit-remaining': 'unlimited',
                    'ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1)
                }
            };
        }

        // Apply standard rate limiting (2 requests per second)
        const rateLimitResult = await checkRateLimit(userId);
        
        const rateLimitHeaders: RateLimitHeaders = {
            'ratelimit-limit': '2',
            'ratelimit-remaining': String(rateLimitResult.remaining),
            'ratelimit-reset': String(rateLimitResult.resetTime)
        };

        if (rateLimitResult.retryAfter) {
            rateLimitHeaders['retry-after'] = String(rateLimitResult.retryAfter);
        }

        if (!rateLimitResult.allowed) {
            console.log(`🚫 Rate limit exceeded for user: ${userId}`);
            
            // Build headers object ensuring all values are strings
            const responseHeaders: Record<string, string> = {
                'ratelimit-limit': rateLimitHeaders['ratelimit-limit'],
                'ratelimit-remaining': rateLimitHeaders['ratelimit-remaining'],
                'ratelimit-reset': rateLimitHeaders['ratelimit-reset']
            };
            
            if (rateLimitHeaders['retry-after']) {
                responseHeaders['retry-after'] = rateLimitHeaders['retry-after'];
            }
            
            return NextResponse.json(
                { 
                    error: "Rate limit exceeded",
                    message: "Maximum 2 requests per second allowed. Upgrade or contact support for higher limits."
                },
                { 
                    status: 429,
                    headers: responseHeaders
                }
            );
        }

        console.log(`✅ Request validated for user: ${userId} (${rateLimitResult.remaining} remaining)`);
        return { userId, rateLimitHeaders };

    } catch (error) {
        console.error("Error validating request: " + error)
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }
}