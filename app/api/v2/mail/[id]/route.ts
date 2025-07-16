import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/auth'
import { getEmail } from '@/functions/mail/primary'
import { validateRequest } from '../../helper/main'

/**
 * GET /api/v2/mail/[id]
 * Gets a single email by id (returns the entire email object)
 * Supports both session-based auth and API key auth
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Get session (handles both regular sessions and API key sessions)
        const { userId, error } = await validateRequest(request)
        if (!userId) {
            return NextResponse.json(
                { error: error },
                { status: 401 }
            )
        }
        const { id } = await params

        // Validate email ID
        if (!id || typeof id !== 'string') {
            return NextResponse.json(
                { error: 'Valid email ID is required' },
                { status: 400 }
            )
        }

        // Call the function with userId
        const result = await getEmail(userId, id)

        if (result.error) {
            if (result.error === 'Email not found') {
                return NextResponse.json(
                    { error: 'Email not found' },
                    { status: 404 }
                )
            }
            return NextResponse.json(
                { error: result.error },
                { status: 500 }
            )
        }

        return NextResponse.json(result.data)

    } catch (error) {
        console.error('Error in GET /api/v2/mail/[id]:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
} 