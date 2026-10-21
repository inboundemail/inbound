/**
 * Helper functions for handling special agent@inbnd.dev email address
 * This email can be used by any user for sending emails through the v2 APIs
 */

import { domainToASCII } from 'node:url'
import * as mimeFuncs from 'nodemailer/lib/mime-funcs'

export const AGENT_EMAIL_ADDRESS = 'agent@inbnd.dev'

export interface ParsedMailbox {
  name: string | null
  address: string
  localPart: string
  domain: string
}

export type MailboxParseResult =
  | { ok: true; mailbox: ParsedMailbox }
  | { ok: false; error: string }

const MAX_MAILBOX_LENGTH = 998
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const UNQUOTED_NAME_FORBIDDEN = /[<>"\\\u0000-\u001f\u007f]/
const NAME_NEEDS_QUOTES = /[()<>[\]:;@\\,."]/
const NON_ASCII = /[^\u0000-\u007f]/
const NAME_INVISIBLE_CHARACTERS = /[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g
const NAME_BREAKING_CHARACTERS = /[\u0000-\u001f\u007f<>\u2039\u203a\u2329\u232a\u276e\u276f\u3008\u3009\ufe64\ufe65\uff1c\uff1e]/g
const ENCODED_WORD_MAX_LENGTH = 52

function invalid(error: string): MailboxParseResult {
  return { ok: false, error }
}

function parseAddrSpec(value: string): { localPart: string; domain: string } | null {
  if (value.length === 0 || value.length > 254 || /\s/.test(value)) return null
  const at = value.indexOf('@')
  if (at <= 0 || at !== value.lastIndexOf('@')) return null

  const localPart = value.slice(0, at)
  const rawDomain = value.slice(at + 1)
  const domain = NON_ASCII.test(rawDomain) ? domainToASCII(rawDomain) : rawDomain.toLowerCase()
  if (!domain || NON_ASCII.test(domain)) return null
  if (localPart.length > 64 || !LOCAL_PART.test(localPart)) return null
  if (domain.length > 253) return null
  const labels = domain.split('.')
  if (labels.length < 2 || !labels.every((label) => DOMAIN_LABEL.test(label))) return null

  return { localPart, domain }
}

function parseDisplayName(value: string): string | null | undefined {
  const name = value.trim()
  if (name.length === 0) return null

  if (name.startsWith('"')) {
    if (name.length < 2 || !name.endsWith('"')) return undefined
    let result = ''
    const inner = name.slice(1, -1)
    for (let index = 0; index < inner.length; index++) {
      const char = inner[index]
      if (char === '\\') {
        index++
        if (index >= inner.length) return undefined
        result += inner[index]
      } else if (char === '"') {
        return undefined
      } else {
        result += char
      }
    }
    const trimmed = result.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (UNQUOTED_NAME_FORBIDDEN.test(name)) return undefined
  return name.includes('=?') ? decodeEncodedWords(name) : name
}

const ENCODED_WORD = /=\?([^?\s]+)\?([QqBb])\?([^?\s]*)\?=/g

/**
 * Decodes RFC 2047 encoded words in an unquoted display name, so names that
 * formatMailbox encoded round-trip instead of being encoded twice. Words in an
 * unknown charset are left as written.
 */
function decodeEncodedWords(value: string): string {
  return value
    .replace(/(\?=)\s+(?==\?)/g, '$1')
    .replace(ENCODED_WORD, (word, charset: string, encoding: string, text: string) => {
      try {
        const bytes =
          encoding.toUpperCase() === 'B'
            ? Buffer.from(text, 'base64')
            : Buffer.from(
                text
                  .replace(/_/g, ' ')
                  .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
                    String.fromCharCode(Number.parseInt(hex, 16)),
                  ),
                'latin1',
              )
        return new TextDecoder(charset.split('*')[0], { fatal: true }).decode(bytes)
      } catch {
        return word
      }
    })
}

/**
 * Strictly parses a single mailbox: `local@domain`, `<local@domain>`,
 * `Name <local@domain>` or `"Quoted Name" <local@domain>`. Rejects anything
 * that could be read as more than one address (several `<`/`>`, a bare list,
 * unquoted `"` or `\` in the display name) or that contains control characters.
 * The domain is lowercased and IDN domains are converted to punycode; the
 * local part keeps its case.
 */
export function parseMailbox(input: string): MailboxParseResult {
  if (typeof input !== 'string') return invalid('Email address must be a string')
  if (input.length > MAX_MAILBOX_LENGTH) return invalid('Email address is too long')
  if (CONTROL_CHARACTERS.test(input)) {
    return invalid('Email address must not contain line breaks or control characters')
  }

  const value = input.trim()
  if (value.length === 0) return invalid('Email address is required')

  const opens = value.split('<').length - 1
  const closes = value.split('>').length - 1

  let name: string | null = null
  let addrSpec: string

  if (opens === 0 && closes === 0) {
    addrSpec = value
  } else if (opens === 1 && closes === 1) {
    const open = value.indexOf('<')
    const close = value.indexOf('>')
    if (close < open || close !== value.length - 1) {
      return invalid('Email address must contain exactly one <address>')
    }
    const parsedName = parseDisplayName(value.slice(0, open))
    if (parsedName === undefined) return invalid('Invalid display name in email address')
    name = parsedName
    addrSpec = value.slice(open + 1, close).trim()
  } else {
    return invalid('Email address must contain exactly one <address>')
  }

  const parsed = parseAddrSpec(addrSpec)
  if (!parsed) return invalid('Invalid email address format')

  return {
    ok: true,
    mailbox: {
      name,
      address: `${parsed.localPart}@${parsed.domain}`,
      localPart: parsed.localPart,
      domain: parsed.domain,
    },
  }
}

/**
 * Formats a mailbox so that it always re-parses with parseMailbox to the same
 * address. Display names lose control, bidi and invisible characters and
 * angle brackets (including look-alikes). Names with non-ASCII characters or a
 * literal `=?` are RFC 2047 encoded, so clients show them as written; other
 * names are quoted when they contain specials.
 */
export function formatMailbox(mailbox: { name?: string | null; address: string }): string {
  const name = (mailbox.name ?? '')
    .replace(NAME_INVISIBLE_CHARACTERS, '')
    .replace(NAME_BREAKING_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name) return mailbox.address
  if (NON_ASCII.test(name) || name.includes('=?')) {
    return `${mimeFuncs.encodeWord(name, 'Q', ENCODED_WORD_MAX_LENGTH)} <${mailbox.address}>`
  }
  if (NAME_NEEDS_QUOTES.test(name)) {
    return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" <${mailbox.address}>`
  }
  return `${name} <${mailbox.address}>`
}

export interface ResolvedSender {
  name: string | null
  address: string
  domain: string
  isAgentEmail: boolean
  formatted: string
}

/**
 * Single source of truth for a sender: agent detection, domain checks and the
 * SES FromEmailAddress all derive from this one parse.
 */
export function resolveSender(
  from: string,
): { ok: true; sender: ResolvedSender } | { ok: false; error: string } {
  const parsed = parseMailbox(from)
  if (!parsed.ok) return parsed
  const { name, address, domain } = parsed.mailbox
  return {
    ok: true,
    sender: {
      name,
      address,
      domain,
      isAgentEmail: address.toLowerCase() === AGENT_EMAIL_ADDRESS,
      formatted: formatMailbox({ name, address }),
    },
  }
}

/**
 * True only when the SES FromEmailAddress resolves to exactly the sender that
 * passed the outbound guard.
 */
export function fromAddressMatchesSender(
  fromEmailAddress: string,
  sender: { address: string; domain: string; isAgentEmail: boolean },
): boolean {
  const parsed = parseMailbox(fromEmailAddress)
  if (!parsed.ok) return false
  const address = parsed.mailbox.address.toLowerCase()
  if (parsed.mailbox.domain !== sender.domain.toLowerCase()) return false
  if (address !== sender.address.toLowerCase()) return false
  return sender.isAgentEmail === (address === AGENT_EMAIL_ADDRESS)
}

/**
 * Check if an email address is the special agent@inbnd.dev address
 */
export function isAgentEmail(email: string): boolean {
  const parsed = parseMailbox(email)
  return parsed.ok && parsed.mailbox.address.toLowerCase() === AGENT_EMAIL_ADDRESS
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string {
  const parsed = parseMailbox(email)
  return parsed.ok ? parsed.mailbox.domain : ''
}

/**
 * Extract email address from formatted email (removes name part).
 * Returns an empty string when the input is not exactly one valid mailbox.
 */
export function extractEmailAddress(email: string): string {
  const parsed = parseMailbox(email)
  return parsed.ok ? parsed.mailbox.address : ''
}

/**
 * Extract name from formatted email (removes email part)
 */
export function extractEmailName(email: string): string | null {
  const parsed = parseMailbox(email)
  return parsed.ok ? parsed.mailbox.name : null
}

/**
 * Check if a user can send from a given email address
 * Returns true if:
 * 1. The email is agent@inbnd.dev (allowed for all users)
 * 2. The user owns the domain (checked separately in the API)
 */
export function canUserSendFromEmail(email: string): { isAgentEmail: boolean; domain: string } {
  const domain = extractDomain(email)
  const isAgent = isAgentEmail(email)
  
  return {
    isAgentEmail: isAgent,
    domain
  }
}
