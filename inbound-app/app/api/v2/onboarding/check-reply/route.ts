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
    console.log('🔐 Validating request authentication')
    const { userId, error: authError } = await validateRequest(request)
    if (!userId) {
      console.log('❌ Authentication failed:', authError)
      return NextResponse.json({ error: authError }, { status: 401 })
    }
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
      
      return NextResponse.json(response)
    } else {
      console.log('📭 No replies found for user:', userId)
      return NextResponse.json({ hasReply: false })
    }

  } catch (error) {
    console.error('❌ Check reply error:', error)
    return NextResponse.json(
      { error: 'Failed to check for replies', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
