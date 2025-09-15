import { db } from './db/index'
import { Dub as DubSDK } from 'dub'
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
  return ['links.read', 'links.write', 'tags.read', 'tags.write', 'analytics.read', 'user.read', 'domains.read']
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


// Dub API
export type DubDomain = {
  id: string
  slug: string
  verified: boolean
  primary: boolean
  archived: boolean
  placeholder?: string | null
  expiredUrl?: string | null
  notFoundUrl?: string | null
  logo?: string | null
  assetLinks?: string | null
  appleAppSiteAssociation?: string | null
  createdAt: string
  updatedAt: string
  registeredDomain?: {
    id: string
    autoRenewalDisabledAt?: string | null
    createdAt: string
    expiresAt: string
    renewalFee?: number | null
  } | null
  deepviewData?: string | null
}

export async function listDubDomains(userId: string): Promise<DubDomain[]> {
  const token = await getValidAccessToken(userId)
  if (!token) throw new Error('Dub account not linked')
  const res = await fetch('https://api.dub.co/domains', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // Prevent Next from caching if called server-side
    cache: 'no-store' as RequestCache,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to fetch Dub domains: ${res.status} ${text}`)
  }
  const json = await res.json()
  return Array.isArray(json) ? (json as DubDomain[]) : []
}

export async function getDefaultDubDomain(userId: string): Promise<{ id: string | null; slug: string | null }> {
  const rows = await db.select().from(dubIntegrations).where(eq(dubIntegrations.userId, userId)).limit(1)
  const integ = rows[0]
  if (!integ) return { id: null, slug: null }
  return {
    id: integ.defaultDubDomainId || null,
    slug: integ.defaultDubDomainSlug || null,
  }
}

export async function setDefaultDubDomain(userId: string, params: { id?: string | null; slug?: string | null }): Promise<void> {
  await db.update(dubIntegrations)
    .set({
      defaultDubDomainId: params.id ?? null,
      defaultDubDomainSlug: params.slug ?? null,
      updatedAt: new Date(),
    })
    .where(eq(dubIntegrations.userId, userId))
}

// Tags (Folders)
export type DubTag = { id: string; name: string }

export async function listDubTags(userId: string): Promise<DubTag[]> {
  const token = await getValidAccessToken(userId)
  if (!token) throw new Error('Dub account not linked')
  const res = await fetch('https://api.dub.co/tags', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store' as RequestCache,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to fetch Dub tags: ${res.status} ${text}`)
  }
  const json = await res.json()
  if (!Array.isArray(json)) return []
  return json.map((t: any) => ({ id: t.id, name: t.name })) as DubTag[]
}

export async function createDubTag(userId: string, name: string): Promise<DubTag> {
  const token = await getValidAccessToken(userId)
  if (!token) throw new Error('Dub account not linked')
  const res = await fetch('https://api.dub.co/tags', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to create tag: ${res.status} ${text}`)
  }
  const json = await res.json()
  return { id: json.id, name: json.name } as DubTag
}

export async function getDefaultDubFolder(userId: string): Promise<{ id: string | null; name: string | null }> {
  const rows = await db.select().from(dubIntegrations).where(eq(dubIntegrations.userId, userId)).limit(1)
  const integ = rows[0]
  if (!integ) return { id: null, name: null }
  return {
    id: integ.defaultDubFolderId || null,
    name: integ.defaultDubFolderName || null,
  }
}

export async function setDefaultDubFolder(userId: string, params: { id?: string | null; name?: string | null }): Promise<void> {
  await db.update(dubIntegrations)
    .set({
      defaultDubFolderId: params.id ?? null,
      defaultDubFolderName: params.name ?? null,
      updatedAt: new Date(),
    })
    .where(eq(dubIntegrations.userId, userId))
}

export async function ensureInboundFolder(userId: string): Promise<{ id: string; name: string }> {
  const tags = await listDubTags(userId).catch(() => [])
  const existing = tags.find(t => t.name.toLowerCase() === 'inbound')
  if (existing) return existing
  const created = await createDubTag(userId, 'Inbound')
  return created
}

export async function getEnableDubLinksForEmails(userId: string): Promise<boolean> {
  const rows = await db.select().from(dubIntegrations).where(eq(dubIntegrations.userId, userId)).limit(1)
  const integ = rows[0]
  return !!integ?.enableDubLinksForEmails
}

export async function setEnableDubLinksForEmails(userId: string, enabled: boolean): Promise<void> {
  await db.update(dubIntegrations)
    .set({ enableDubLinksForEmails: enabled, updatedAt: new Date() })
    .where(eq(dubIntegrations.userId, userId))
}

// --- Dub Overrides Verification and Bulk Link Creation ---

export async function verifyDubOverrides(
  userId: string,
  params: { domain?: string | null; tag?: string | null }
): Promise<{ domainSlug?: string | null; tagId?: string | null }> {
  let domainSlug: string | null | undefined
  let tagId: string | null | undefined

  if (params.domain) {
    const domains = await listDubDomains(userId)
    const found = domains.find(d => d.slug.toLowerCase() === params.domain!.toLowerCase())
    if (!found) {
      throw new Error(`Dub domain not found or not accessible: ${params.domain}`)
    }
    if (!found.verified) {
      throw new Error(`Dub domain is not verified: ${params.domain}`)
    }
    domainSlug = found.slug
  }

  if (params.tag) {
    const tags = await listDubTags(userId)
    const foundTag = tags.find(t => t.id === params.tag || t.name.toLowerCase() === params.tag!.toLowerCase())
    if (!foundTag) {
      throw new Error(`Dub tag not found or not accessible: ${params.tag}`)
    }
    tagId = foundTag.id
  }

  return { domainSlug: domainSlug ?? null, tagId: tagId ?? null }
}

export async function createShortLinksBulk(
  userId: string,
  urls: string[],
  opts?: { domainSlug?: string; tagId?: string }
): Promise<Map<string, string>> {
  const token = await getValidAccessToken(userId)
  if (!token) throw new Error('Dub account not linked')

  const payload = urls.map(u => ({
    url: u,
    ...(opts?.domainSlug ? { domain: opts.domainSlug } : {}),
    ...(opts?.tagId ? { tagId: opts.tagId, tags: [opts.tagId] } : {}),
  }))

  // First try official SDK bulk create
  try {
    const dub = new DubSDK({ token })
    const created = await dub.links.createMany(payload as any)
    const map = new Map<string, string>()
    for (const item of Array.isArray(created) ? created : []) {
      const original = (item as any)?.url || (item as any)?.originalUrl
      let short = (item as any)?.shortLink || (item as any)?.shortUrl || (item as any)?.short
      if (original && short) {
        if (typeof short === 'string' && !short.startsWith('http')) short = `https://${short}`
        map.set(original, short)
      }
    }
    if (map.size > 0) return map
  } catch (e) {
    // SDK path failed; fall through to HTTP
  }

  // Try bulk create (variant A: wrapped payload)
  const map = new Map<string, string>()
  const tryParseResults = (json: any) => {
    const arr = Array.isArray(json?.results) ? json.results : Array.isArray(json) ? json : []
    for (const item of arr) {
      const original = item?.url || item?.originalUrl
      let short = item?.shortLink || item?.shortUrl || item?.short
      if (original && short) {
        if (typeof short === 'string' && !short.startsWith('http')) {
          short = `https://${short}`
        }
        map.set(original, short)
      }
    }
  }

  const bulkEndpoints = [
    { body: { links: payload } },
    { body: payload },
  ]

  for (const variant of bulkEndpoints) {
    try {
      const res = await fetch('https://api.dub.co/links/bulk', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(variant.body),
      })
      if (res.ok) {
        const json = await res.json().catch(() => null)
        tryParseResults(json)
        if (map.size > 0) return map
      }
    } catch {}
  }

  // Fallback: create links individually
  for (const u of urls) {
    try {
      const res = await fetch('https://api.dub.co/links', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: u,
          ...(opts?.domainSlug ? { domain: opts.domainSlug } : {}),
          ...(opts?.tagId ? { tagId: opts.tagId, tags: [opts.tagId] } : {}),
        }),
      })
      if (!res.ok) continue
      const json = await res.json().catch(() => null)
      let short = json?.shortLink || json?.shortUrl || json?.short
      if (short) {
        if (typeof short === 'string' && !short.startsWith('http')) {
          short = `https://${short}`
        }
        map.set(u, short)
      }
    } catch {}
  }

  return map
}


