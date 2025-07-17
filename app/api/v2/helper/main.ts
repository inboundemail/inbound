"use server"

import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { NextRequest } from "next/server";


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
        if (session?.user?.id) {
            return { userId: session.user.id }
        } else if (apiSession?.key?.userId) {
            return { userId: apiSession.key.userId }
        } else {
            return { error: "Unauthorized" }
        }
    } catch (error) {
        console.error("Error validating request: " + error)
        return { error: "Unauthorized" }
    }
}