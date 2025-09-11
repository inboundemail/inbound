import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import Timer from "@/components/icons/timer"
import Database2 from "@/components/icons/database-2"
import ShieldCheck from "@/components/icons/shield-check"
import Microchip from "@/components/icons/microchip"

export const metadata: Metadata = {
  title: 'Email Webhook API - Convert Emails to HTTP Webhooks | inbound',
  description: 'Professional email webhook API for developers. Convert any email address to HTTP webhook endpoints. TypeScript SDK, structured data parsing, and reliable delivery included.',
  keywords: [
    'email webhook API',
    'email to webhook',
    'email webhook service',
    'webhook email processing',
    'email API for developers',
    'inbound email API',
    'email parsing API',
    'structured email data',
    'typescript email SDK',
    'email infrastructure API',
    'webhook email forwarding',
    'email automation API',
    'email processing service',
    'programmatic email handling',
    'email webhooks for developers'
  ],
  openGraph: {
    title: 'Email Webhook API - Convert Emails to HTTP Webhooks',
    description: 'Professional email webhook API for developers. Convert any email address to HTTP webhook endpoints with TypeScript SDK and structured data parsing.',
    type: 'website',
    url: 'https://inbound.new/email-webhook-api',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Email Webhook API - Convert Emails to HTTP Webhooks',
    description: 'Professional email webhook API for developers. Convert any email address to HTTP webhook endpoints with TypeScript SDK.',
  },
  alternates: {
    canonical: 'https://inbound.new/email-webhook-api'
  }
}

export default async function EmailWebhookAPIPage() {
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
              <span className="text-[#1C2894]">Email Webhook API</span>
              <br />
              for Modern Developers
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-2xl mx-auto leading-relaxed">
              Convert any email address into a powerful HTTP webhook endpoint. 
              Get structured email data, reliable delivery, and full TypeScript support. 
              Built for developers who need programmatic email processing.
            </p>

            <div className="flex items-center gap-4 max-w-md mx-auto mt-8">
              <Input type="email" placeholder="webhook@yourapp.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Start Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Start Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>

            <p className="text-sm text-gray-500 mt-3">
              No credit card required • 1,000 webhooks/month free • TypeScript SDK included
            </p>
          </div>

          {/* How Email Webhooks Work */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">How Email Webhooks Work</h2>
            
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Step 1 */}
              <div className="bg-linear-to-br from-blue-50 to-blue-100 rounded-xl p-8 border border-blue-200">
                <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Envelope2 width="32" height="32" className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">1. Email Arrives</h3>
                <p className="text-gray-600">
                  Someone sends an email to your configured address (e.g. support@yourapp.com)
                </p>
              </div>

              {/* Step 2 */}
              <div className="bg-linear-to-br from-purple-50 to-purple-100 rounded-xl p-8 border border-purple-200">
                <div className="w-16 h-16 bg-purple-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Database2 width="32" height="32" className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">2. Parse & Structure</h3>
                <p className="text-gray-600">
                  inbound parses the email into clean, structured JSON with headers, content, and attachments
                </p>
              </div>

              {/* Step 3 */}
              <div className="bg-linear-to-br from-green-50 to-green-100 rounded-xl p-8 border border-green-200">
                <div className="w-16 h-16 bg-green-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <BoltLightning width="32" height="32" className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">3. HTTP Webhook</h3>
                <p className="text-gray-600">
                  Structured data is sent to your webhook URL as an HTTP POST with full type safety
                </p>
              </div>
            </div>
          </div>

          {/* API Features */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Professional Email Webhook Features</h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* TypeScript SDK */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Code2 width="32" height="32" className="text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">TypeScript SDK</h3>
                <p className="text-gray-600">
                  Full type safety with IntelliSense support. Never guess webhook payload structure again.
                </p>
              </div>

              {/* Structured Data */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Database2 width="32" height="32" className="text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Structured Email Data</h3>
                <p className="text-gray-600">
                  Parsed headers, body content, attachments, and metadata in clean JSON format.
                </p>
              </div>

              {/* Reliable Delivery */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck width="32" height="32" className="text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Reliable Delivery</h3>
                <p className="text-gray-600">
                  Automatic retries, exponential backoff, and 99.9% webhook delivery success rate.
                </p>
              </div>

              {/* Real-time Processing */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-yellow-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Timer width="32" height="32" className="text-yellow-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Real-time Processing</h3>
                <p className="text-gray-600">
                  Webhooks delivered within 2 seconds of email receipt. No delays or queuing.
                </p>
              </div>

              {/* Email Threading */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BoltLightning width="32" height="32" className="text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Email Threading</h3>
                <p className="text-gray-600">
                  Automatic conversation threading and In-Reply-To tracking for context-aware apps.
                </p>
              </div>

              {/* AI Ready */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Microchip width="32" height="32" className="text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">AI Ready</h3>
                <p className="text-gray-600">
                  Perfect for feeding emails to AI models, ChatGPT integrations, and automation workflows.
                </p>
              </div>
            </div>
          </div>

          {/* Code Example */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Simple Email Webhook Integration</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Set up email webhooks in minutes with our TypeScript SDK. No complex configuration required.
            </p>

            <div className="max-w-4xl mx-auto text-left">
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">Complete Email Webhook Setup</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`import { createInboundClient } from '@inboundemail/sdk'

const inbound = createInboundClient({
  apiKey: process.env.INBOUND_API_KEY
})

// 1. Create webhook endpoint
const webhook = await inbound.webhooks.create({
  name: 'Support Emails',
  url: 'https://api.yourapp.com/webhooks/email'
})

// 2. Setup email address  
await inbound.emails.create({
  email: 'support@yourapp.com',
  webhookId: webhook.id
})

// 3. Handle incoming webhooks
app.post('/webhooks/email', (req, res) => {
  const { email }: InboundWebhookPayload = req.body
  
  // Fully typed, structured data
  console.log('From:', email.parsedData.from.address)
  console.log('Subject:', email.parsedData.subject)
  console.log('Content:', email.parsedData.textBody)
  
  // Process attachments
  email.parsedData.attachments.forEach(attachment => {
    console.log('File:', attachment.filename)
    console.log('Size:', attachment.size)
  })
  
  res.status(200).json({ success: true })
})`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Email Webhook Use Cases</h2>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto text-left">
              {/* Customer Support */}
              <div className="bg-white rounded-xl p-8 border border-blue-200 shadow-sm">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                  <Envelope2 width="32" height="32" className="text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Customer Support Automation</h3>
                <p className="text-gray-600 mb-4">
                  Turn support emails into tickets, route to the right team, and trigger automated responses.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Auto-create tickets</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Route by subject/content</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Auto-reply with AI</span>
                  </div>
                </div>
              </div>

              {/* Lead Generation */}
              <div className="bg-white rounded-xl p-8 border border-green-200 shadow-sm">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mb-6">
                  <Globe2 width="32" height="32" className="text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Lead Generation & CRM</h3>
                <p className="text-gray-600 mb-4">
                  Capture leads from contact forms, qualify automatically, and sync to your CRM.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Parse contact forms</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Extract lead data</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Sync to CRM/database</span>
                  </div>
                </div>
              </div>

              {/* AI & Automation */}
              <div className="bg-white rounded-xl p-8 border border-purple-200 shadow-sm">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                  <Microchip width="32" height="32" className="text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">AI & Automation</h3>
                <p className="text-gray-600 mb-4">
                  Feed emails to AI models for classification, sentiment analysis, and automated processing.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">AI classification</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Sentiment analysis</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Auto-responses</span>
                  </div>
                </div>
              </div>

              {/* Monitoring & Alerts */}
              <div className="bg-white rounded-xl p-8 border border-red-200 shadow-sm">
                <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mb-6">
                  <ShieldCheck width="32" height="32" className="text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">System Monitoring</h3>
                <p className="text-gray-600 mb-4">
                  Parse system alerts, create incidents, and integrate with DevOps workflows.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Parse alerts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Create incidents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Slack/Discord integration</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Webhook Payload Example */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Rich Webhook Payload</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Unlike basic email forwarding services, inbound delivers structured, typed data perfect for modern applications.
            </p>

            <div className="max-w-4xl mx-auto text-left">
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">Example Webhook Payload</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`{
  "event": "email.received",
  "timestamp": "2024-01-15T10:30:00Z",
  "email": {
    "id": "email_abc123",
    "messageId": "<abc@example.com>",
    "from": "customer@company.com",
    "to": ["support@yourapp.com"],
    "subject": "Integration help needed",
    "receivedAt": "2024-01-15T10:30:00Z",
    
    "parsedData": {
      "messageId": "<abc@example.com>",
      "from": {
        "address": "customer@company.com",
        "name": "John Smith"
      },
      "to": [{"address": "support@yourapp.com"}],
      "subject": "Integration help needed",
      "textBody": "Hi, I need help with...",
      "htmlBody": "<p>Hi, I need help with...</p>",
      "attachments": [
        {
          "filename": "screenshot.png",
          "contentType": "image/png", 
          "size": 45234,
          "url": "https://..."
        }
      ],
      "headers": {"X-Custom": "value"},
      "inReplyTo": null,
      "references": [],
      "date": "2024-01-15T10:29:00Z"
    }
  }
}`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Start Guide */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Quick Start Guide</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Get your first email webhook working in under 5 minutes.
            </p>

            <div className="space-y-8 max-w-4xl mx-auto text-left">
              {/* Step 1 */}
              <div className="bg-linear-to-br from-blue-50 to-blue-100 rounded-xl p-8 border border-blue-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">1</div>
                  <h3 className="text-xl font-bold text-gray-900">Install & Setup</h3>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <div className="text-green-400">$ bun add @inboundemail/sdk</div>
                  <div className="text-gray-300 mt-2">
                    <span className="text-blue-400">import</span> {`{ createInboundClient }`} <span className="text-blue-400">from</span> <span className="text-yellow-300">'@inboundemail/sdk'</span>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-linear-to-br from-purple-50 to-purple-100 rounded-xl p-8 border border-purple-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold">2</div>
                  <h3 className="text-xl font-bold text-gray-900">Create Webhook</h3>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-300">
                    <span className="text-blue-400">const</span> webhook = <span className="text-blue-400">await</span> inbound.webhooks.<span className="text-yellow-300">create</span>({`{`}
                  </div>
                  <div className="text-gray-300 ml-4">
                    <div>name: <span className="text-green-300">'My Webhook'</span>,</div>
                    <div>url: <span className="text-green-300">'https://api.yourapp.com/webhook'</span></div>
                  </div>
                  <div className="text-gray-300">{`})`}</div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-linear-to-br from-green-50 to-green-100 rounded-xl p-8 border border-green-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold">3</div>
                  <h3 className="text-xl font-bold text-gray-900">Handle Webhooks</h3>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-300">
                    app.<span className="text-yellow-300">post</span>(<span className="text-green-300">'/webhook'</span>, (req, res) =&gt; &#123;
                  </div>
                  <div className="text-gray-300 ml-4">
                    <div><span className="text-blue-400">const</span> &#123; email &#125; = req.body</div>
                    <div className="mt-2 text-gray-400">// Fully typed data</div>
                    <div><span className="text-yellow-300">console</span>.<span className="text-yellow-300">log</span>(email.parsedData.from.address)</div>
                    <div><span className="text-yellow-300">console</span>.<span className="text-yellow-300">log</span>(email.parsedData.subject)</div>
                    <div className="mt-2">res.<span className="text-yellow-300">json</span>(&#123; success: true &#125;)</div>
                  </div>
                  <div className="text-gray-300">&#125;)</div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Start Building Email Webhooks Today</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join thousands of developers who trust inbound for reliable email webhook processing.
            </p>
            
            <div className="flex items-center gap-4 max-w-md mx-auto mb-6">
              <Input type="email" placeholder="your@domain.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Start Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Start Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>

            <p className="text-sm text-gray-500">
              ✓ 1,000 webhooks/month free ✓ TypeScript SDK ✓ 5-minute setup ✓ No credit card required
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

