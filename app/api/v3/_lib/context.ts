"use server"

import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import { db } from "@/lib/db"
import { user as userSchema } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export interface BaseContext {
  req: Request
}

export interface AuthenticatedContext extends BaseContext {
  userId: string
  authMethod: 'session' | 'api_key'
  user: {
    id: string
    email: string
    name: string
  }
}

export async function createContext(req: Request): Promise<BaseContext> {
  return { req }
}

export async function createAuthenticatedContext(
  req: Request
): Promise<AuthenticatedContext | { error: string }> {
  try {
    console.log('🔐 Creating authenticated context')
    
    // Check session auth
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (session?.user?.id) {
      console.log('✅ Authenticated via session:', session.user.id)
      return {
        req,
        userId: session.user.id,
        authMethod: 'session',
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name
        }
      }
    }

    // Check API key auth
    const authHeader = req.headers.get('Authorization')
    const apiKey = authHeader?.replace('Bearer ', '')
    
    if (!apiKey) {
      console.log('❌ No authentication credentials provided')
      return { error: 'No authentication credentials provided' }
    }

    console.log('🔑 Checking API key authentication')
    const apiSession = await auth.api.verifyApiKey({
      body: { key: apiKey }
    })

    if (apiSession?.key?.userId) {
      // Fetch user details for API key auth
      const user = await db.query.user.findFirst({
        where: eq(userSchema.id, apiSession.key.userId)
      })

      if (!user) {
        console.log('❌ User not found for API key')
        return { error: 'User not found for API key' }
      }

      console.log('✅ Authenticated via API key:', user.id)
      return {
        req,
        userId: user.id,
        authMethod: 'api_key',
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      }
    }

    console.log('❌ Invalid authentication credentials')
    return { error: 'Invalid authentication credentials' }
  } catch (error) {
    console.error('❌ Auth context error:', error)
    return { error: 'Authentication failed' }
  }
}


