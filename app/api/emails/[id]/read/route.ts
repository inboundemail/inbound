import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { receivedEmails } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get session from auth
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: emailId } = await params

    if (!emailId) {
      return NextResponse.json({ error: 'Email ID is required' }, { status: 400 })
    }

    // Update the email to mark it as read
    const result = await db
      .update(receivedEmails)
      .set({
        isRead: true,
        readAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(receivedEmails.id, emailId),
          eq(receivedEmails.userId, session.user.id)
        )
      )
      .returning()

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Email not found or access denied' },
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      email: result[0] 
    })

  } catch (error) {
    console.error('Error marking email as read:', error)
    return NextResponse.json(
      { error: 'Failed to mark email as read' },
      { status: 500 }
    )
  }
} 