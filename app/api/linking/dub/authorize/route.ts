import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { headers } from 'next/headers'
import { buildAuthorizeUrl, generatePkcePair, getScopes } from '@/lib/dub'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://inbound.new'))
  }

  const state = crypto.randomUUID()
  const { verifier, challenge } = generatePkcePair()
  const redirect = buildAuthorizeUrl({ state, scopes: getScopes(), codeChallenge: challenge, codeChallengeMethod: 'S256' })
  const res = NextResponse.redirect(redirect)
  // Store CSRF state in HttpOnly cookie for validation in callback
  res.cookies.set('dub_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV !== 'development',
    path: '/',
    maxAge: 10 * 60, // 10 minutes
  })
  // Store PKCE verifier securely in HttpOnly cookie
  res.cookies.set('dub_oauth_pkce', verifier, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV !== 'development',
    path: '/',
    maxAge: 10 * 60,
  })
  return res
}


