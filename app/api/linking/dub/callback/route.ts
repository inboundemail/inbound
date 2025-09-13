import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { headers, cookies } from 'next/headers'
import { exchangeCodeForTokens, upsertIntegration } from '@/lib/dub'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const base = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://inbound.new'
  const settingsUrl = new URL('/settings', base)

  if (error) {
    settingsUrl.searchParams.set('dub_error', error)
    return NextResponse.redirect(settingsUrl)
  }

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', base))
  }

  // Validate CSRF state
  const cookieStore = await cookies()
  const expectedState = cookieStore.get('dub_oauth_state')?.value
  const pkceVerifier = cookieStore.get('dub_oauth_pkce')?.value
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    settingsUrl.searchParams.set('dub_error', 'invalid_state')
    return NextResponse.redirect(settingsUrl)
  }

  if (!code) {
    settingsUrl.searchParams.set('dub_error', 'missing_code')
    return NextResponse.redirect(settingsUrl)
  }

  try {
    const tokens = await exchangeCodeForTokens(code, { codeVerifier: pkceVerifier || undefined })
    await upsertIntegration(session.user.id, tokens)
    const res = NextResponse.redirect(settingsUrl)
    // Clear state cookie
    res.cookies.set('dub_oauth_state', '', { path: '/', maxAge: 0 })
    res.cookies.set('dub_oauth_pkce', '', { path: '/', maxAge: 0 })
    settingsUrl.searchParams.set('dub_linked', 'true')
    return res
  } catch (e: any) {
    settingsUrl.searchParams.set('dub_error', e?.message || 'token_exchange_failed')
    return NextResponse.redirect(settingsUrl)
  }
}


