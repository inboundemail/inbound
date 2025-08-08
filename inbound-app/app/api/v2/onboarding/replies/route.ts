import { NextRequest } from 'next/server'
import { validateRequest } from '../../helper/main'
import { db } from '@/lib/db'
import { onboardingDemoEmails } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * GET /api/v2/onboarding/replies
 * Server-Sent Events endpoint for real-time demo reply notifications
 * Only works on platforms that support streaming responses (not Vercel serverless)
 */

export async function GET(request: NextRequest) {
  console.log('📡 GET /api/v2/onboarding/replies - Starting SSE connection')
  
  try {
    console.log('🔐 Validating request authentication')
    const { userId, error: authError } = await validateRequest(request)
    if (!userId) {
      console.log('❌ Authentication failed:', authError)
      return new Response('Unauthorized', { status: 401 })
    }
    console.log('✅ Authentication successful for userId:', userId)

    // Create SSE stream
    const stream = new ReadableStream({
      start(controller) {
        console.log('🔄 Starting SSE stream for user:', userId)
        
        // Send initial connection message
        controller.enqueue(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)
        
        // Poll for replies every 2 seconds
        const interval = setInterval(async () => {
          try {
            const replies = await db
              .select()
              .from(onboardingDemoEmails)
              .where(
                and(
                  eq(onboardingDemoEmails.userId, userId),
                  eq(onboardingDemoEmails.replyReceived, true)
                )
              )
              .limit(1)
            
            if (replies.length > 0) {
              const reply = replies[0]
              console.log('📨 Found reply for user:', userId)
              
              controller.enqueue(`data: ${JSON.stringify({
                type: 'reply',
                from: reply.replyFrom,
                subject: reply.replySubject,
                body: reply.replyBody,
                receivedAt: reply.replyReceivedAt
              })}\n\n`)
              
              // Stop polling after first reply
              clearInterval(interval)
              controller.close()
            }
          } catch (error) {
            console.error('❌ Error polling for replies:', error)
            controller.enqueue(`data: ${JSON.stringify({ type: 'error', message: 'Polling error' })}\n\n`)
          }
        }, 2000)
        
        // Cleanup on disconnect
        request.signal?.addEventListener('abort', () => {
          console.log('🔌 SSE connection closed for user:', userId)
          clearInterval(interval)
          controller.close()
        })
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    })

  } catch (error) {
    console.error('❌ SSE endpoint error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
