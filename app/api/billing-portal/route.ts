import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { Autumn as autumn } from 'autumn-js'

export async function POST(request: NextRequest) {
  try {
    // Get user session
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Create billing portal session
    const { data: billingPortal, error } = await autumn.customers.billingPortal(
      session.user.id,
      {
        return_url: `${process.env.BETTER_AUTH_URL}/settings`
      }
    )

    if (error || !billingPortal?.url) {
      console.error('Billing portal error:', error)
      return NextResponse.json(
        { error: 'Failed to create billing portal session' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      url: billingPortal.url
    })
  } catch (error) {
    console.error('Error creating billing portal session:', error)
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    )
  }
} 