"use server"

import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/redis/rate-limiter";

export interface ValidateRequestSuccess {
    userId: string
}

export interface ValidateRequestError {
    error: string
    status?: number
    retryAfter?: number
    limit?: number
    remaining?: number
}

export type ValidateRequestResult = ValidateRequestSuccess | ValidateRequestError

export async function validateRequest(request: NextRequest): Promise<ValidateRequestResult> {
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
        let userId: string | null = null
        let authType: 'session' | 'apikey' | null = null

        if (session?.user?.id) {
            userId = session.user.id
            authType = 'session'
        } else if (apiSession?.key?.userId) {
            userId = apiSession.key.userId
            authType = 'apikey'
        }

        if (!userId) {
            return { error: "Unauthorized" }
        }

        // Rate limiting check (separate limits for session vs API key auth)
        const rateLimitKey = `${authType}:${userId}`
        console.log(`⏱️ Checking rate limit for ${rateLimitKey}`)

        const rateLimitResult = await checkRateLimit(rateLimitKey)

        if (!rateLimitResult.success) {
            console.log(`❌ Rate limit exceeded for ${rateLimitKey}: ${rateLimitResult.remaining}/${rateLimitResult.limit} remaining`)
            return {
                error: "Rate limit exceeded",
                status: 429,
                retryAfter: rateLimitResult.retryAfter,
                limit: rateLimitResult.limit,
                remaining: rateLimitResult.remaining
            }
        }

        console.log(`✅ Rate limit OK for ${rateLimitKey}: ${rateLimitResult.remaining}/${rateLimitResult.limit} remaining`)
        return { userId }
    } catch (error) {
        console.error("Error validating request: " + error)
        return { error: "Unauthorized" }
    }
}