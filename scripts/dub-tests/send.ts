#!/usr/bin/env bun

import 'dotenv/config'
import { render } from '@react-email/render'
import { 
  WelcomeSaaSOnboarding,
  PasswordResetSecure,
  InvoicePaymentNotification,
  SubscriptionRenewalReminder,
  TeamMemberInvitation,
  DataExportReady,
  TrialExpirationWarning,
  AccountEmailVerification
} from './email-tests'

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
const TEST_TO = process.env.TEST_TO || 'inboundemaildotnew@gmail.com'

const sampleLinks = [
  'https://google.com',
  'https://twitter.com', 
  'https://linkedin.com',
  'https://inbound.new',
  'https://github.com',
  'https://stackoverflow.com',
  'https://example.com'
]

// Template functions that return rendered components with Dub test links
const emailTemplates = [
  {
    name: 'Welcome SaaS',
    render: () => WelcomeSaaSOnboarding({
      name: "Alex Chen",
      email: "alex@techstartup.com",
      companyName: "TechStartup Inc",
      appName: "FlowBoard",
      dashboardUrl: sampleLinks[0], // Will be shortened by Dub
      helpUrl: sampleLinks[1],      // Will be shortened by Dub
      logoUrl: "https://placehold.co/120x40?text=FlowBoard"
    })
  },
  {
    name: 'Password Reset',
    render: () => PasswordResetSecure({
      name: "Sarah Kim",
      email: "sarah@company.com",
      appName: "SecureApp",
      resetUrl: sampleLinks[2],     // Will be shortened by Dub
      logoUrl: "https://placehold.co/120x40?text=SecureApp",
      expirationMinutes: 30
    })
  },
  {
    name: 'Invoice Payment',
    render: () => InvoicePaymentNotification({
      customerName: "Michael Torres",
      companyName: "Design Studios LLC",
      invoiceNumber: "INV-2024-123",
      amount: "$149.00",
      dueDate: "2024-02-28",
      servicePeriod: "February 2024", 
      planName: "Pro Plan",
      invoiceUrl: sampleLinks[3],   // Will be shortened by Dub
      paymentUrl: sampleLinks[4],   // Will be shortened by Dub
      logoUrl: "https://placehold.co/120x40?text=CloudSuite",
      appName: "CloudSuite"
    })
  },
  {
    name: 'Team Invitation',
    render: () => TeamMemberInvitation({
      inviteeName: "jordan@newcompany.com",
      inviterName: "Emma Rodriguez",
      inviterEmail: "emma@acme.com",
      workspaceName: "Acme Corp Projects",
      role: "Editor",
      inviteUrl: sampleLinks[5],    // Will be shortened by Dub
      appName: "ProjectHub",
      logoUrl: "https://placehold.co/120x40?text=ProjectHub",
      workspaceDescription: "Our main workspace for client projects and deliverables"
    })
  },
  {
    name: 'Data Export Ready',
    render: () => DataExportReady({
      userName: "Jennifer Martinez",
      exportType: "Customer Analytics",
      fileName: "customer-analytics-2024-02.csv",
      fileSize: "3.7 MB",
      recordCount: "2,156",
      downloadUrl: sampleLinks[6],  // Will be shortened by Dub
      requestedAt: new Date().toISOString(),
      appName: "DataVault",
      logoUrl: "https://placehold.co/120x40?text=DataVault"
    })
  }
]

function getRandomTemplate() {
  return emailTemplates[Math.floor(Math.random() * emailTemplates.length)]
}

async function buildHtml(label: string): Promise<string> {
  const template = getRandomTemplate()
  
  try {
    const emailComponent = template.render()
    const html = await render(emailComponent)
    
    // Add a test indicator to the HTML
    const testIndicator = `\n<!-- Dub Test: ${label} | Template: ${template.name} -->\n`
    return testIndicator + html
  } catch (error) {
    console.warn(`Failed to render template ${template.name}:`, error)
    // Fallback to simple HTML
    return `
    <html>
      <body>
        <h1>Dub Test: ${label} (Fallback)</h1>
        <p>Template rendering failed. These are test links that should be shortened by Dub:</p>
        <ul>
          ${sampleLinks.map((u) => `<li><a href="${u}">${u}</a></li>`).join('')}
        </ul>
      </body>
    </html>
    `.trim()
  }
}

async function buildText(label: string): Promise<string> {
  const template = getRandomTemplate()
  
  try {
    const emailComponent = template.render()
    const text = await render(emailComponent, { plainText: true })
    
    // Add test info to the text version
    return `Dub Test: ${label} | Template: ${template.name}\n\n${text}`
  } catch (error) {
    console.warn(`Failed to render text for template ${template.name}:`, error)
    // Fallback to simple text
    return [
      `Dub Test: ${label} (Fallback)`,
      'Template rendering failed. Test links to shorten:',
      ...sampleLinks,
      '',
      'This mailto should be ignored: mailto:support@example.com',
    ].join('\n')
  }
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
      from: 'Agent <agent@inbound.new>',
      to: TEST_TO,
      subject: baseSubject + ' • HTML',
      html: await buildHtml(t.label),
      text: await buildText(t.label),
      dub: t.dub,
    }
    const r1 = await sendEmail(htmlPayload, `dub-test-${crypto.randomUUID()}`)
    console.log(`\n[HTML] ${t.label} → status=${r1.status}`)
    console.log(r1.data)

    // Plaintext-only  
    const textPayload: SendPayload = {
      from: 'Agent <agent@inbound.new>',
      to: TEST_TO,
      subject: baseSubject + ' • TEXT',
      text: await buildText(t.label),
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


