import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PricingTable } from "@/components/autumn/pricing-table-format" 
import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import CustomInboundIcon from "@/components/icons/customInbound"
import type { Metadata } from 'next'
import Link from 'next/link'

// Nucleo icon imports
import ArrowBoldRight from "@/components/icons/arrow-bold-right"
import Envelope2 from "@/components/icons/envelope-2"
import Globe2 from "@/components/icons/globe-2"
import BoltLightning from "@/components/icons/bolt-lightning"
import CircleSparkle from "@/components/icons/circle-sparkle"
import Check2 from "@/components/icons/check-2"
import InboundIcon from "@/components/icons/inbound"
import Code2 from "@/components/icons/code-2"
import Database2 from "@/components/icons/database-2"
import ShieldCheck from "@/components/icons/shield-check"
import Microchip from "@/components/icons/microchip"
import File2 from "@/components/icons/file-2"
import Timer from "@/components/icons/timer"
import Files from "@/components/icons/files"

export const metadata: Metadata = {
  title: 'Email Parsing API - Extract Structured Data from Emails | inbound',
  description: 'Professional email parsing API that extracts structured data from raw emails. Get headers, body content, attachments, and metadata with TypeScript SDK. Built for developers.',
  keywords: [
    'email parsing API',
    'email parser',
    'parse email API',
    'email data extraction',
    'structured email parsing',
    'email content parser',
    'email header parser', 
    'attachment extraction API',
    'email metadata API',
    'typescript email parser',
    'email processing API',
    'email data API',
    'parse email headers',
    'extract email content',
    'email parsing service'
  ],
  openGraph: {
    title: 'Email Parsing API - Extract Structured Data from Emails',
    description: 'Professional email parsing API that extracts structured data from raw emails. Get headers, body content, attachments, and metadata with TypeScript SDK.',
    type: 'website',
    url: 'https://inbound.new/email-parsing-api',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Email Parsing API - Extract Structured Data from Emails',
    description: 'Professional email parsing API that extracts structured data from raw emails. Get headers, body content, attachments, and metadata.',
  },
  alternates: {
    canonical: 'https://inbound.new/email-parsing-api'
  }
}

export default async function EmailParsingAPIPage() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  return (
    <div className="min-h-screen bg-white">
      {/* Main Content */}
      <main className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Section */}
          <div className="mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              <span className="text-[#1C2894]">Email Parsing API</span>
              <br />
              That Actually Works
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-2xl mx-auto leading-relaxed">
              Stop wrestling with raw email headers and MIME parsing. Get clean, structured email data 
              from any email with our professional parsing API. Built for developers who value their time.
            </p>

            <div className="flex items-center gap-4 max-w-md mx-auto mt-8">
              <Input type="email" placeholder="parse@yourapp.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Start Parsing
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Start Parsing
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>

            <p className="text-sm text-gray-500 mt-3">
              No credit card required • 1,000 emails/month free • Parse immediately
            </p>
          </div>

          {/* What Gets Parsed */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Complete Email Data Extraction</h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Headers & Metadata */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Files width="32" height="32" className="text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Headers & Metadata</h3>
                <p className="text-gray-600 mb-4">
                  Message-ID, In-Reply-To, References, Date, and all custom headers extracted and structured.
                </p>
                <div className="text-left space-y-1">
                  <div className="text-sm text-gray-500">• Message threading data</div>
                  <div className="text-sm text-gray-500">• Custom headers</div>
                  <div className="text-sm text-gray-500">• Routing information</div>
                </div>
              </div>

              {/* Content Parsing */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Database2 width="32" height="32" className="text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Content Parsing</h3>
                <p className="text-gray-600 mb-4">
                  Separate plain text and HTML content with proper encoding and structure preservation.
                </p>
                <div className="text-left space-y-1">
                  <div className="text-sm text-gray-500">• Plain text body</div>
                  <div className="text-sm text-gray-500">• HTML body</div>
                  <div className="text-sm text-gray-500">• Encoding detection</div>
                </div>
              </div>

              {/* Address Parsing */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Envelope2 width="32" height="32" className="text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Address Parsing</h3>
                <p className="text-gray-600 mb-4">
                  From, To, CC, BCC, and Reply-To addresses parsed with names and email addresses separated.
                </p>
                <div className="text-left space-y-1">
                  <div className="text-sm text-gray-500">• Name extraction</div>
                  <div className="text-sm text-gray-500">• Email validation</div>
                  <div className="text-sm text-gray-500">• Multiple recipients</div>
                </div>
              </div>

              {/* Attachment Parsing */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-yellow-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <File2 width="32" height="32" className="text-yellow-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Attachment Processing</h3>
                <p className="text-gray-600 mb-4">
                  Automatic attachment extraction with filename, content type, and size detection.
                </p>
                <div className="text-left space-y-1">
                  <div className="text-sm text-gray-500">• Binary data handling</div>
                  <div className="text-sm text-gray-500">• MIME type detection</div>
                  <div className="text-sm text-gray-500">• Size validation</div>
                </div>
              </div>

              {/* Security Analysis */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck width="32" height="32" className="text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Security Analysis</h3>
                <p className="text-gray-600 mb-4">
                  SPF, DKIM, DMARC validation plus spam filtering and malware detection built-in.
                </p>
                <div className="text-left space-y-1">
                  <div className="text-sm text-gray-500">• Auth verification</div>
                  <div className="text-sm text-gray-500">• Spam detection</div>
                  <div className="text-sm text-gray-500">• Malware scanning</div>
                </div>
              </div>

              {/* Threading Analysis */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BoltLightning width="32" height="32" className="text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Thread Analysis</h3>
                <p className="text-gray-600 mb-4">
                  Intelligent conversation threading with reply chain reconstruction and context preservation.
                </p>
                <div className="text-left space-y-1">
                  <div className="text-sm text-gray-500">• Reply chain tracking</div>
                  <div className="text-sm text-gray-500">• Conversation grouping</div>
                  <div className="text-sm text-gray-500">• Context preservation</div>
                </div>
              </div>
            </div>
          </div>

          {/* API Example */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Simple Email Parsing API</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Send raw email content to our parsing API and get back clean, structured data. Perfect for processing stored emails or custom integrations.
            </p>

            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto text-left">
              {/* API Request */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">API Request</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`POST https://api.inbound.new/v2/parse
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "rawEmail": "From: sender@example.com\\n
To: recipient@yourapp.com\\n
Subject: Test email\\n
Content-Type: text/plain\\n\\n
Hello, this is a test email with
an attachment."
}`}
                  </pre>
                </div>
              </div>

              {/* API Response */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">Parsed Response</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`{
  "success": true,
  "parsedData": {
    "messageId": "<abc123@example.com>",
    "date": "2024-01-15T10:30:00Z",
    "from": {
      "address": "sender@example.com",
      "name": "John Doe"
    },
    "to": [
      {"address": "recipient@yourapp.com"}
    ],
    "subject": "Test email",
    "textBody": "Hello, this is a test...",
    "htmlBody": null,
    "attachments": [
      {
        "filename": "document.pdf",
        "contentType": "application/pdf",
        "size": 12345,
        "url": "https://storage.inbound.new/..."
      }
    ],
    "headers": {
      "X-Custom-Header": "value"
    }
  }
}`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Parsing Capabilities */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Advanced Email Parsing Capabilities</h2>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto text-left">
              {/* MIME Parsing */}
              <div className="bg-white rounded-xl p-8 border border-blue-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <CustomInboundIcon 
                    backgroundColor="#3b82f6" 
                    Icon={Database2} 
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">MIME Parsing</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  Handle complex multipart emails, nested MIME structures, and mixed content types automatically.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Multipart/mixed parsing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Nested MIME handling</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Encoding detection</span>
                  </div>
                </div>
              </div>

              {/* Header Analysis */}
              <div className="bg-white rounded-xl p-8 border border-green-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <CustomInboundIcon 
                    backgroundColor="#10b981" 
                    Icon={Files} 
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">Header Analysis</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  Extract and parse all email headers including authentication, routing, and custom headers.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Authentication headers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Routing information</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Custom header extraction</span>
                  </div>
                </div>
              </div>

              {/* Content Extraction */}
              <div className="bg-white rounded-xl p-8 border border-purple-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <CustomInboundIcon 
                    backgroundColor="#8b5cf6" 
                    Icon={Code2} 
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">Content Extraction</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  Separate plain text and HTML content with smart encoding handling and structure preservation.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Plain text extraction</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">HTML content parsing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Encoding normalization</span>
                  </div>
                </div>
              </div>

              {/* Attachment Processing */}
              <div className="bg-white rounded-xl p-8 border border-yellow-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <CustomInboundIcon 
                    backgroundColor="#f59e0b" 
                    Icon={File2} 
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">Attachment Processing</h3>
                </div>
                <p className="text-gray-600 mb-4">
                  Extract, decode, and store attachments with metadata including filename, size, and content type.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Binary data handling</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">MIME type detection</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Secure storage URLs</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* TypeScript SDK */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">TypeScript SDK for Email Parsing</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Get full type safety and IntelliSense support with our TypeScript SDK. Makes email parsing development fast and error-free.
            </p>

            <div className="max-w-4xl mx-auto text-left">
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">TypeScript Email Parsing Example</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`import { createInboundClient } from '@inboundemail/sdk'

const inbound = createInboundClient({
  apiKey: process.env.INBOUND_API_KEY
})

// Parse email from raw source
const result = await inbound.emails.parse({
  rawEmail: emailSource
})

// Fully typed response with IntelliSense
const parsedEmail = result.parsedData

// Access data with full type safety
console.log('From Name:', parsedEmail.from.name)
console.log('From Email:', parsedEmail.from.address)
console.log('Subject:', parsedEmail.subject)
console.log('Text Body:', parsedEmail.textBody)
console.log('HTML Body:', parsedEmail.htmlBody)

// Process attachments with types
parsedEmail.attachments.forEach((attachment) => {
  console.log('Filename:', attachment.filename)
  console.log('Content Type:', attachment.contentType)
  console.log('Size (bytes):', attachment.size)
  console.log('Download URL:', attachment.url)
})

// Access headers and metadata
console.log('Message ID:', parsedEmail.messageId)
console.log('Date:', parsedEmail.date)
console.log('In Reply To:', parsedEmail.inReplyTo)
console.log('References:', parsedEmail.references)

// Custom headers
console.log('Custom Headers:', parsedEmail.headers)`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Integration Options */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Flexible Integration Options</h2>
            
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* REST API */}
              <div className="bg-linear-to-br from-blue-50 to-blue-100 rounded-xl p-8 border border-blue-200 text-center">
                <CustomInboundIcon 
                  backgroundColor="#3b82f6" 
                  Icon={Globe2} 
                  size={64}
                  className="mx-auto mb-6"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-3">REST API</h3>
                <p className="text-gray-600 mb-4">
                  Standard REST endpoints for parsing emails from any language or framework.
                </p>
                <div className="bg-gray-800 rounded-lg p-3 text-left">
                  <div className="font-mono text-xs text-green-400">POST /v2/emails/parse</div>
                  <div className="font-mono text-xs text-blue-400 mt-1">GET /v2/emails/{'{id}'}</div>
                </div>
              </div>

              {/* Webhooks */}
              <div className="bg-linear-to-br from-purple-50 to-purple-100 rounded-xl p-8 border border-purple-200 text-center">
                <CustomInboundIcon 
                  backgroundColor="#8b5cf6" 
                  Icon={BoltLightning} 
                  size={64}
                  className="mx-auto mb-6"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-3">Real-time Webhooks</h3>
                <p className="text-gray-600 mb-4">
                  Automatic parsing with webhook delivery for real-time email processing workflows.
                </p>
                <div className="bg-gray-800 rounded-lg p-3 text-left">
                  <div className="font-mono text-xs text-green-400">Auto-parse incoming emails</div>
                  <div className="font-mono text-xs text-blue-400 mt-1">Webhook delivery {'<2s'}</div>
                </div>
              </div>

              {/* SDK */}
              <div className="bg-linear-to-br from-green-50 to-green-100 rounded-xl p-8 border border-green-200 text-center">
                <CustomInboundIcon 
                  backgroundColor="#10b981" 
                  Icon={Code2} 
                  size={64}
                  className="mx-auto mb-6"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-3">TypeScript SDK</h3>
                <p className="text-gray-600 mb-4">
                  Native SDK with full type definitions and IntelliSense support for faster development.
                </p>
                <div className="bg-gray-800 rounded-lg p-3 text-left">
                  <div className="font-mono text-xs text-green-400">bun add @inboundemail/sdk</div>
                  <div className="font-mono text-xs text-blue-400 mt-1">Full TypeScript support</div>
                </div>
              </div>
            </div>
          </div>

          {/* Common Parsing Scenarios */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Common Email Parsing Scenarios</h2>
            
            <div className="space-y-6 max-w-4xl mx-auto text-left">
              {/* Support Ticket Creation */}
              <div className="bg-linear-to-br from-blue-50 to-blue-100 rounded-xl p-8 border border-blue-200">
                <h3 className="text-xl font-bold text-gray-900 mb-3">Support Ticket Creation</h3>
                <p className="text-gray-600 mb-4">
                  Parse support emails to automatically create tickets with proper categorization and routing.
                </p>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-300">
                    <span className="text-gray-400">// Extract ticket data from email</span>
                  </div>
                  <div className="text-gray-300">
                    <span className="text-blue-400">const</span> ticket = {`{`}
                  </div>
                  <div className="text-gray-300 ml-4">
                    <div>customer: email.parsedData.from.address,</div>
                    <div>subject: email.parsedData.subject,</div>
                    <div>description: email.parsedData.textBody,</div>
                    <div>attachments: email.parsedData.attachments</div>
                  </div>
                  <div className="text-gray-300">{`}`}</div>
                </div>
              </div>

              {/* Order Processing */}
              <div className="bg-linear-to-br from-green-50 to-green-100 rounded-xl p-8 border border-green-200">
                <h3 className="text-xl font-bold text-gray-900 mb-3">Order & Invoice Processing</h3>
                <p className="text-gray-600 mb-4">
                  Parse order confirmations, invoices, and receipts to extract structured business data.
                </p>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-300">
                    <span className="text-gray-400">// Extract order data</span>
                  </div>
                  <div className="text-gray-300">
                    <span className="text-blue-400">const</span> orderData = parseOrderEmail(email.parsedData)
                  </div>
                  <div className="text-gray-300">
                    <span className="text-gray-400">// { 'orderId, amount, items, customer' }</span>
                  </div>
                </div>
              </div>

              {/* Lead Qualification */}
              <div className="bg-linear-to-br from-purple-50 to-purple-100 rounded-xl p-8 border border-purple-200">
                <h3 className="text-xl font-bold text-gray-900 mb-3">Lead Qualification</h3>
                <p className="text-gray-600 mb-4">
                  Parse contact form emails to extract lead information and automatically score prospects.
                </p>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-300">
                    <span className="text-gray-400">// Extract lead data</span>
                  </div>
                  <div className="text-gray-300">
                    <span className="text-blue-400">const</span> lead = extractLeadData(email.parsedData)
                  </div>
                  <div className="text-gray-300">
                    <span className="text-gray-400">// Auto-score and route to sales</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">Simple Email Parsing Pricing</h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              Start with 1,000 parsed emails free every month. Scale affordably as your email processing grows.
            </p>
            <PricingTable />
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Ready to Parse Emails Like a Pro?</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join thousands of developers who trust inbound for professional email parsing and processing.
            </p>
            
            <div className="flex items-center gap-4 max-w-md mx-auto mb-6">
              <Input type="email" placeholder="your@domain.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Start Parsing Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Start Parsing Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>

            <p className="text-sm text-gray-500">
              ✓ 1,000 emails/month free ✓ TypeScript SDK ✓ Structured data ✓ No setup fees
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <InboundIcon width={24} height={24} />
            <span className="text-lg font-bold text-gray-900">inbound</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="https://twitter.com/intent/follow?screen_name=inbounddotnew" className="hover:text-gray-700 transition-colors flex items-center gap-1">Contact us on
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 1200 1227"><path fill="#000" d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z" /></svg></a>
            <a href="https://discord.gg/JVdUrY9gJZ" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors flex items-center gap-1">Discord
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"/></svg></a>
            <a href="/privacy" className="hover:text-gray-700 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-gray-700 transition-colors">Terms</a>
            <a href="/docs" className="hover:text-gray-700 transition-colors">Docs</a>
            <a href="mailto:support@inbound.exon.dev" className="hover:text-gray-700 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

