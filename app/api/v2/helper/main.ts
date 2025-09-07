"use server"

import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { user } from "@/lib/db/auth-schema";
import { eq } from "drizzle-orm";


export async function validateRequest(request: NextRequest) {
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
        let userId: string;
        if (session?.user?.id) {
            userId = session.user.id;
        } else if (apiSession?.key?.userId) {
            userId = apiSession.key.userId;
        } else {
            return { error: "Unauthorized" }
        }

        // Check if user is suspended
        const userData = await db.select({
            banned: user.banned,
            banReason: user.banReason,
            banExpires: user.banExpires
        }).from(user).where(eq(user.id, userId)).limit(1);

        if (userData.length === 0) {
            return { error: "User not found" }
        }

        const userInfo = userData[0];
        
        // Check if user is banned
        if (userInfo.banned) {
            // If ban has an expiration date, check if it's still active
            if (userInfo.banExpires && new Date() > userInfo.banExpires) {
                // Ban has expired, but we should probably clear the ban flag
                // For now, we'll let them through but this should be cleaned up
            } else {
                // User is currently banned
                return { 
                    error: "Account suspended", 
                    suspended: true,
                    reason: userInfo.banReason || "Your account has been suspended. Please contact support."
                }
            }
        }

        return { userId }
    } catch (error) {
        console.error("Error validating request: " + error)
        return { error: "Unauthorized" }
    }
}