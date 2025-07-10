import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { headers } from 'next/headers'

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

    const { apiKey } = await request.json()

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      )
    }

    if (!apiKey.startsWith('re_')) {
      return NextResponse.json(
        { error: 'Invalid Resend API key format. It should start with "re_"' },
        { status: 400 }
      )
    }

    console.log(`🔍 Fetching domains from Resend for user: ${session.user.id}`)

    // Fetch domains from Resend API
    const response = await fetch('https://api.resend.com/domains', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Invalid API key. Please check your Resend API key.' },
          { status: 401 }
        )
      }
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'Access forbidden. Please check your API key permissions.' },
          { status: 403 }
        )
      }
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        )
      }
      
      console.error(`Resend API error: ${response.status} ${response.statusText}`)
      return NextResponse.json(
        { error: 'Failed to fetch domains from Resend API' },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    console.log(`✅ Successfully fetched ${data.data?.length || 0} domains from Resend`)

    return NextResponse.json({
      success: true,
      domains: data.data || [],
      count: data.data?.length || 0
    })

  } catch (error) {
    console.error('Error fetching Resend domains:', error)
    return NextResponse.json(
      { error: 'Internal server error while fetching domains' },
      { status: 500 }
    )
  }
} 