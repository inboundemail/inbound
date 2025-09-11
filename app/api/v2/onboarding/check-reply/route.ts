import { NextRequest, NextResponse } from 'next/server'
import { validateRequest } from '../../helper/main'
import { db } from '@/lib/db'
import { onboardingDemoEmails } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'

/**
 * GET /api/v2/onboarding/check-reply
 * Check if user has received a demo reply (for polling)
 * Works on Vercel serverless
 */

interface CheckReplyResponse {
  hasReply: boolean
  reply?: {
    from: string
    subject: string
    body: string
    receivedAt: string
  }
}

export async function GET(request: NextRequest) {
  console.log('🔍 GET /api/v2/onboarding/check-reply - Checking for replies')
  
  try {
    console.log('🔐 Validating request authentication and rate limits')
    const validationResult = await validateRequest(request)
    
    // If validation returned a NextResponse (error or rate limit), return it immediately
    if (validationResult instanceof NextResponse) {
        return validationResult
    }
    
    // Otherwise, we have a successful validation with userId and rate limit headers
    const { userId, rateLimitHeaders } = validationResult
    console.log('✅ Authentication successful for userId:', userId)

    // Check for replies
    const replies = await db
      .select()
      .from(onboardingDemoEmails)
      .where(
        and(
          eq(onboardingDemoEmails.userId, userId),
          eq(onboardingDemoEmails.replyReceived, true)
        )
      )
      .orderBy(desc(onboardingDemoEmails.replyReceivedAt))
      .limit(1)
    
    if (replies.length > 0) {
      const reply = replies[0]
      console.log('📨 Found reply for user:', userId)

      console.log('🔍 Reply:', reply.replyBody?.split('\n\n')[0])
      
      const response: CheckReplyResponse = {
        hasReply: true,
        reply: {
          from: reply.replyFrom || '',
          subject: reply.replySubject || '',
          body: reply.replyBody?.split('\n\n')[0] || '',
          receivedAt: reply.replyReceivedAt?.toISOString() || ''
        }
      }
      
      // Convert rate limit headers to proper format
      const responseHeaders: Record<string, string> = {
          'ratelimit-limit': rateLimitHeaders['ratelimit-limit'],
          'ratelimit-remaining': rateLimitHeaders['ratelimit-remaining'],
          'ratelimit-reset': rateLimitHeaders['ratelimit-reset']
      }
      if (rateLimitHeaders['retry-after']) {
          responseHeaders['retry-after'] = rateLimitHeaders['retry-after']
      }
      
      return NextResponse.json(response, { headers: responseHeaders })
    } else {
      console.log('📭 No replies found for user:', userId)
      
      // Convert rate limit headers to proper format
      const responseHeaders: Record<string, string> = {
          'ratelimit-limit': rateLimitHeaders['ratelimit-limit'],
          'ratelimit-remaining': rateLimitHeaders['ratelimit-remaining'],
          'ratelimit-reset': rateLimitHeaders['ratelimit-reset']
      }
      if (rateLimitHeaders['retry-after']) {
          responseHeaders['retry-after'] = rateLimitHeaders['retry-after']
      }
      
      return NextResponse.json({ hasReply: false }, { headers: responseHeaders })
    }

  } catch (error) {
    console.error('❌ Check reply error:', error)
    return NextResponse.json(
      { error: 'Failed to check for replies', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
