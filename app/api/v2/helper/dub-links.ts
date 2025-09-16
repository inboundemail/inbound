import LinkifyIt from 'linkify-it'
import { load } from 'cheerio'
import { getEnableDubLinksForEmails, listDubDomains, verifyDubOverrides, createShortLinksBulk } from '@/lib/dub'

export type DubPerRequestConfig = {
  enabled?: boolean
  domain?: string
  // Backwards-compatible: allow tag, but prefer folder
  tag?: string
  folder?: string
}

export type RewrittenBodies = {
  text?: string
  html?: string
}

const linkify = new LinkifyIt()

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function shouldSkipUrl(url: string): boolean {
  if (!url) return true
  const lower = url.trim().toLowerCase()
  
  // Skip non-HTTP(S) schemes
  if (lower.startsWith('mailto:')) return true
  if (lower.startsWith('tel:')) return true
  if (lower.startsWith('data:')) return true
  if (lower.startsWith('cid:')) return true
  if (lower.startsWith('javascript:')) return true
  if (lower.startsWith('file:')) return true
  if (lower.startsWith('ftp:')) return true
  if (lower.startsWith('about:')) return true
  
  // Skip fragments and relative paths
  if (lower === '#' || lower.startsWith('#')) return true
  if (lower.startsWith('/') || lower.startsWith('./') || lower.startsWith('../')) return true
  
  // Skip localhost and private IPs
  if (lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('::1')) return true
  if (lower.match(/https?:\/\/(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/)) return true
  
  // Skip obviously malformed URLs
  if (lower.includes('..') && lower.includes('//')) return true
  if (lower.length > 2048) return true // Reasonable URL length limit
  
  // Only proceed with HTTP(S) URLs
  return !isHttpUrl(lower)
}

function stripTrailingSlash(u: string): string {
  try {
    const url = new URL(u)
    if (url.pathname.endsWith('/') && url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '')
    }
    return url.toString()
  } catch {
    return u
  }
}

function extractUrlsFromText(text?: string): string[] {
  if (!text) return []
  const matches = linkify.match(text) || []
  const urls: string[] = []
  for (const m of matches) {
    const candidate = m.raw || m.url
    if (!shouldSkipUrl(candidate)) urls.push(candidate)
  }
  return urls
}

function rewriteTextWithMap(text: string, urlMap: Map<string, string>): string {
  const matches = linkify.match(text) || []
  if (matches.length === 0) return text
  let result = ''
  let last = 0
  for (const m of matches) {
    const raw = m.raw || m.url
    const replacement = urlMap.get(raw) || urlMap.get(stripTrailingSlash(raw))
    result += text.slice(last, m.index)
    result += replacement || raw
    last = (m as any).lastIndex ?? (m.index + raw.length)
  }
  result += text.slice(last)
  return result
}

function extractAnchorHrefsFromHtml(html?: string): string[] {
  if (!html) return []
  const $ = load(html)
  const urls: string[] = []
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim()
    if (!shouldSkipUrl(href)) urls.push(href)
  })
  return urls
}

function rewriteHtmlAnchors(html: string, urlMap: Map<string, string>): string {
  try {
    const $ = load(html, { 
      xmlMode: false
    })
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim()
      if (!href) return
      const replacement = urlMap.get(href) || urlMap.get(stripTrailingSlash(href))
      if (replacement) {
        $(el).attr('href', replacement)
      }
    })
    // Use $.root().html() to get the full HTML, fallback to original on any issues
    const result = $.root().html()
    return result || html
  } catch (error) {
    console.warn('HTML parsing failed, returning original content:', error instanceof Error ? error.message : error)
    return html
  }
}

/**
 * Shared utility to safely apply Dub link rewriting to email bodies
 * Handles errors gracefully and logs appropriately
 */
export async function applyDubRewritingIfEnabled(
  userId: string,
  textBody: string,
  htmlBody: string | null,
  config?: DubPerRequestConfig,
  context = 'email'
): Promise<{ text: string; html: string | null }> {
  try {
    const rewritten = await rewriteBodiesWithDub(userId, { text: textBody, html: htmlBody || undefined }, config)
    return {
      text: rewritten.text || textBody,
      html: rewritten.html || htmlBody
    }
  } catch (e) {
    console.warn(`Dub link rewrite skipped (${context}):`, e instanceof Error ? e.message : e)
    return { text: textBody, html: htmlBody }
  }
}

export async function rewriteBodiesWithDub(
  userId: string,
  bodies: { text?: string; html?: string },
  config?: DubPerRequestConfig
): Promise<RewrittenBodies> {
  const enabled = typeof config?.enabled === 'boolean'
    ? !!config.enabled
    : await getEnableDubLinksForEmails(userId)

  if (!enabled) {
    return { text: bodies.text, html: bodies.html }
  }

  const textUrls = extractUrlsFromText(bodies.text)
  const htmlUrls = extractAnchorHrefsFromHtml(bodies.html)
  const all = Array.from(new Set([...textUrls, ...htmlUrls]))
  if (all.length === 0) {
    return { text: bodies.text, html: bodies.html }
  }
  console.log('🔗 Dub rewrite: detected URLs', { total: all.length })

  // Skip already-tracked Dub links
  const dubDomains = await listDubDomains(userId).catch(() => [])
  const knownDubHosts = new Set<string>([
    'dub.co',
    'dub.sh',
    ...dubDomains.map(d => d.slug.toLowerCase()),
  ])
  const candidates = all.filter(u => {
    try {
      const host = new URL(u).host.toLowerCase()
      // If domainSlug is specified, consider it also as a dub domain to avoid double-shortening
      if (config?.domain && host === config.domain.toLowerCase()) return false
      return !knownDubHosts.has(host)
    } catch {
      return false
    }
  })

  if (candidates.length === 0) {
    console.log('🔗 Dub rewrite: no candidates after filtering')
    return { text: bodies.text, html: bodies.html }
  }

  // Verify overrides and prepare bulk create
  const { domainSlug, folderId, tagId } = await verifyDubOverrides(userId, {
    domain: config?.domain,
    folder: config?.folder,
    tag: config?.tag,
  })

  // Cap number of links to avoid abuse/rate limits
  const MAX_LINKS = 50
  const unique = Array.from(new Set(candidates)).slice(0, MAX_LINKS)

  const createdMap = await createShortLinksBulk(userId, unique, {
    domainSlug: domainSlug || undefined,
    folderId: folderId || undefined,
    tagId: tagId || undefined,
  })
  console.log('🔗 Dub rewrite: created short links', { requested: unique.length, created: createdMap.size, domain: domainSlug, folderId, tagId })

  // Build a string-to-string map for exact replacements
  const urlMap = new Map<string, string>()
  for (const orig of unique) {
    const key = orig
    const normalized = stripTrailingSlash(orig)
    const short = createdMap.get(orig) || createdMap.get(normalized)
    if (short) {
      urlMap.set(key, short)
      urlMap.set(normalized, short)
    }
  }

  const rewritten: RewrittenBodies = { text: bodies.text, html: bodies.html }
  if (rewritten.text) rewritten.text = rewriteTextWithMap(rewritten.text, urlMap)
  if (rewritten.html) rewritten.html = rewriteHtmlAnchors(rewritten.html, urlMap)
  return rewritten
}


