#!/usr/bin/env bun

import 'dotenv/config'

type DubConfig = {
  enabled?: boolean
  domain?: string
  tag?: string
}

type SendPayload = {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  headers?: Record<string, string>
  dub?: DubConfig
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const API_KEY = process.env.INBOUND_API_KEY || process.env.API_KEY
const TEST_TO = process.env.TEST_TO || 'ryan@mandarin3d.com'

const sampleLinks = [
  'https://google.com',
  'https://twitter.com',
  'https://linkedin.com',
  'https://inbound.new',
]

function buildHtml(label: string): string {
  return `
  <html>
    <body>
      <h1>Dub Test: ${label}</h1>
      <p>These are test links that should be shortened by Dub (non-media):</p>
      <ul>
        ${sampleLinks.map((u) => `<li><a href="${u}">${u}</a></li>`).join('')}
      </ul>
      <p>Image should not be touched:</p>
      <img src="https://placeholder.com/120x80.png?text=Test" width="120" height="80" />
    </body>
  </html>
  `.trim()
}

function buildText(label: string): string {
  return [
    `Dub Test: ${label}`,
    'Non-media links to shorten:',
    ...sampleLinks,
    '',
    'This mailto should be ignored: mailto:support@mandarin3d.com',
  ].join('\n')
}

async function sendEmail(payload: SendPayload, idempotencyKey?: string) {
  const url = `${BASE_URL}/api/v2/emails`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  const status = res.status
  let bodyText = ''
  try { bodyText = await res.text() } catch {}
  let json: any = null
  try { json = JSON.parse(bodyText) } catch { /* not json */ }
  return { status, data: json ?? bodyText }
}

async function run() {
  const tests: { label: string; dub?: DubConfig }[] = [
    { label: 'default (enabled only)', dub: { enabled: true } },
    { label: 'useexon.link + Inbound', dub: { enabled: true, domain: 'useexon.link', tag: 'Inbound' } },
    { label: 'inbd.link (default tag)', dub: { enabled: true, domain: 'inbd.link' } },
    { label: 'exon.co + Marketing', dub: { enabled: true, domain: 'exon.co', tag: 'Marketing' } },
  ]

  console.log(`\n➡️  Sending ${tests.length * 2} test emails to ${BASE_URL} (to: ${TEST_TO})`)
  console.log(`   Auth: ${API_KEY ? 'API key provided' : 'no API key provided (session required)'}`)

  for (const t of tests) {
    const baseSubject = `Dub Test • ${t.label} • ${new Date().toISOString()}`

    // HTML + Text
    const htmlPayload: SendPayload = {
      from: 'Agent <agent@inbnd.dev>',
      to: TEST_TO,
      subject: baseSubject + ' • HTML',
      html: buildHtml(t.label),
      text: buildText(t.label),
      dub: t.dub,
    }
    const r1 = await sendEmail(htmlPayload, `dub-test-${crypto.randomUUID()}`)
    console.log(`\n[HTML] ${t.label} → status=${r1.status}`)
    console.log(r1.data)

    // Plaintext-only
    const textPayload: SendPayload = {
      from: 'Agent <agent@inbnd.dev>',
      to: TEST_TO,
      subject: baseSubject + ' • TEXT',
      text: buildText(t.label),
      dub: t.dub,
    }
    const r2 = await sendEmail(textPayload, `dub-test-${crypto.randomUUID()}`)
    console.log(`\n[TEXT] ${t.label} → status=${r2.status}`)
    console.log(r2.data)
  }

  console.log('\n✅ Dub tests completed.')
}

run().catch((e) => {
  console.error('Dub tests failed:', e)
  process.exit(1)
})


