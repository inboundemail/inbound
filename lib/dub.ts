import { db } from './db/index'
import { dubIntegrations, type DubIntegration } from './db/schema'
import { eq } from 'drizzle-orm'
import { createHash, randomBytes } from 'crypto'

// OAuth constants
const DUB_AUTH_URL = 'https://app.dub.co/oauth/authorize'
const DUB_TOKEN_URL = 'https://api.dub.co/oauth/token'

export type DubTokenResponse = {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  scope?: string
}

export function getDubClientId(): string {
  const clientId = process.env.DUB_CLIENT_ID
  if (!clientId) throw new Error('DUB_CLIENT_ID is not set')
  return clientId
}

export function getDubClientSecret(): string {
  const secret = process.env.DUB_CLIENT_SECRET
  if (!secret) throw new Error('DUB_CLIENT_SECRET is not set')
  return secret
}

export function getDubRedirectUri(): string {
  const base = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:3000' 
    : 'https://inbound.new'
  return `${base}/api/linking/dub/callback`
}

export function buildAuthorizeUrl(params: { state: string; scopes: string[]; redirectUri?: string; codeChallenge?: string; codeChallengeMethod?: 'S256' | 'plain' }): string {
  const redirectUri = params.redirectUri || getDubRedirectUri()
  const url = new URL(DUB_AUTH_URL)
  url.searchParams.set('client_id', getDubClientId())
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', params.scopes.join(' '))
  url.searchParams.set('state', params.state)
  if (params.codeChallenge) {
    url.searchParams.set('code_challenge', params.codeChallenge)
    url.searchParams.set('code_challenge_method', params.codeChallengeMethod || 'S256')
  }
  return url.toString()
}

export async function exchangeCodeForTokens(code: string, options?: { redirectUri?: string; codeVerifier?: string }): Promise<DubTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: getDubClientId(),
    redirect_uri: options?.redirectUri || getDubRedirectUri(),
    grant_type: 'authorization_code',
  })
  if (options?.codeVerifier) {
    body.set('code_verifier', options.codeVerifier)
  } else {
    // Non-PKCE fallback (server-side secret). If PKCE is enforced, server will reject without code_verifier
    body.set('client_secret', getDubClientSecret())
  }

  const res = await fetch(DUB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to exchange code: ${res.status} ${text}`)
  }
  const json = await res.json() as DubTokenResponse
  return json
}

export async function refreshAccessToken(userId: string): Promise<DubIntegration | null> {
  const rows = await db.select().from(dubIntegrations).where(eq(dubIntegrations.userId, userId)).limit(1)
  const existing = rows[0]
  if (!existing) return null

  const now = new Date()
  if (existing.expiresAt && new Date(existing.expiresAt).getTime() - now.getTime() > 60_000) {
    return existing
  }

  const body = new URLSearchParams({
    client_id: getDubClientId(),
    client_secret: getDubClientSecret(),
    grant_type: 'refresh_token',
    refresh_token: existing.refreshToken,
  })

  const res = await fetch(DUB_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    // mark as expired
    await db.update(dubIntegrations).set({ status: 'expired', updatedAt: new Date() }).where(eq(dubIntegrations.userId, userId))
    throw new Error(`Failed to refresh token: ${res.status}`)
  }
  const json = await res.json() as DubTokenResponse

  const updated: Partial<DubIntegration> = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || existing.refreshToken,
    tokenType: json.token_type || existing.tokenType,
    scope: json.scope || existing.scope,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    status: 'active',
    updatedAt: new Date(),
  }

  await db.update(dubIntegrations).set(updated).where(eq(dubIntegrations.userId, userId))
  const refreshed = await db.select().from(dubIntegrations).where(eq(dubIntegrations.userId, userId)).limit(1)
  return refreshed[0] || null
}

export async function upsertIntegration(userId: string, tokens: DubTokenResponse): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
  const rows = await db.select().from(dubIntegrations).where(eq(dubIntegrations.userId, userId)).limit(1)
  if (rows[0]) {
    await db.update(dubIntegrations).set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      scope: tokens.scope || rows[0].scope,
      expiresAt,
      status: 'active',
      updatedAt: new Date(),
    }).where(eq(dubIntegrations.userId, userId))
  } else {
    await db.insert(dubIntegrations).values({
      id: crypto.randomUUID(),
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      scope: tokens.scope || 'user.read',
      expiresAt,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const rows = await db.select().from(dubIntegrations).where(eq(dubIntegrations.userId, userId)).limit(1)
  const integ = rows[0]
  if (!integ) return null
  const now = Date.now()
  if (integ.expiresAt && new Date(integ.expiresAt).getTime() - now > 60_000) {
    return integ.accessToken
  }
  const refreshed = await refreshAccessToken(userId)
  return refreshed?.accessToken || null
}

export function getScopes(): string[] {
  return ['links.read', 'links.write', 'tags.read', 'tags.write', 'analytics.read', 'user.read']
}

// PKCE helpers
function base64UrlEncode(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32))
  const challenge = base64UrlEncode(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export { DUB_AUTH_URL, DUB_TOKEN_URL }


