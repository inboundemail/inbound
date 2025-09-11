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
import Timer from "@/components/icons/timer"
import Settings3 from "@/components/icons/settings-3"
import Gear2 from "@/components/icons/gear-2"

export const metadata: Metadata = {
  title: 'inbound Email Service - Professional Email Processing Platform | inbound',
  description: 'Professional inbound email service for developers. Process, parse, and route emails with TypeScript SDK, webhooks, and structured data. Better than Mailgun, SendGrid, Postmark.',
  keywords: [
    'inbound email service',
    'inbound email processing',
    'inbound email platform',
    'email processing service',
    'email infrastructure',
    'inbound email API',
    'email management platform',
    'email automation service',
    'inbound email solution',
    'email webhook service',
    'email routing service',
    'custom domain email',
    'email parsing platform',
    'developer email service',
    'TypeScript email service'
  ],
  openGraph: {
    title: 'inbound Email Service - Professional Email Processing Platform',
    description: 'Professional inbound email service for developers. Process, parse, and route emails with TypeScript SDK, webhooks, and structured data.',
    type: 'website',
    url: 'https://inbound.new/inbound-email-service',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'inbound Email Service - Professional Email Processing Platform',
    description: 'Professional inbound email service for developers. Process, parse, and route emails with TypeScript SDK, webhooks, and structured data.',
  },
  alternates: {
    canonical: 'https://inbound.new/inbound-email-service'
  }
}

export default async function InboundEmailServicePage() {
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
              The Complete
              <br />
              <span className="text-[#1C2894]">inbound Email Service</span>
              <br />
              for Developers
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-2xl mx-auto leading-relaxed">
              Stop juggling multiple email services. Get everything you need for inbound email processing: 
              receiving, parsing, webhooks, and automation in one modern platform built for developers.
            </p>

            <div className="flex items-center gap-4 max-w-md mx-auto mt-8">
              <Input type="email" placeholder="hello@yourdomain.com" />
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
              No credit card required • 1,000 emails/month free • Complete email platform
            </p>
          </div>

          {/* All-in-One Platform */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Everything You Need for inbound Emails</h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {/* Receive */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Envelope2 width="32" height="32" className="text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Receive</h3>
                <p className="text-gray-600 text-sm">
                  Custom domain email receiving with unlimited aliases and catch-all support.
                </p>
              </div>

              {/* Parse */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Database2 width="32" height="32" className="text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Parse</h3>
                <p className="text-gray-600 text-sm">
                  Advanced email parsing with headers, content, attachments, and metadata extraction.
                </p>
              </div>

              {/* Route */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BoltLightning width="32" height="32" className="text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Route</h3>
                <p className="text-gray-600 text-sm">
                  Smart email routing to webhooks, APIs, and integrations with retry logic.
                </p>
              </div>

              {/* Automate */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-yellow-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Gear2 width="32" height="32" className="text-yellow-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Automate</h3>
                <p className="text-gray-600 text-sm">
                  AI-powered automation, auto-replies, and workflow triggers for intelligent processing.
                </p>
              </div>
            </div>
          </div>

          {/* Developer First */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Built for Modern Developers</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Unlike legacy email services, inbound is designed from the ground up for today's development workflows.
            </p>

            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* TypeScript First */}
              <div className="bg-linear-to-br from-blue-50 to-blue-100 rounded-xl p-8 border border-blue-200">
                <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Code2 width="32" height="32" className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">TypeScript First</h3>
                <p className="text-gray-600 mb-4">
                  Full type safety with IntelliSense support. Never guess API responses or webhook payloads again.
                </p>
                <div className="bg-gray-800 rounded-lg p-3 text-left">
                  <div className="font-mono text-xs text-green-400">npm i @inboundemail/sdk</div>
                  <div className="font-mono text-xs text-gray-400 mt-1">// Full TypeScript support</div>
                </div>
              </div>

              {/* Modern APIs */}
              <div className="bg-linear-to-br from-green-50 to-green-100 rounded-xl p-8 border border-green-200">
                <div className="w-16 h-16 bg-green-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Globe2 width="32" height="32" className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Modern REST APIs</h3>
                <p className="text-gray-600 mb-4">
                  Clean, consistent REST endpoints with proper HTTP status codes and structured responses.
                </p>
                <div className="bg-gray-800 rounded-lg p-3 text-left">
                  <div className="font-mono text-xs text-blue-400">GET /v2/emails</div>
                  <div className="font-mono text-xs text-green-400">POST /v2/webhooks</div>
                </div>
              </div>

              {/* Real-time Processing */}
              <div className="bg-linear-to-br from-purple-50 to-purple-100 rounded-xl p-8 border border-purple-200">
                <div className="w-16 h-16 bg-purple-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Timer width="32" height="32" className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Real-time Processing</h3>
                <p className="text-gray-600 mb-4">
                  Emails processed and delivered to webhooks within seconds. No delays or queuing bottlenecks.
                </p>
                <div className="bg-gray-800 rounded-lg p-3 text-left">
                  <div className="font-mono text-xs text-green-400">{'<2s'} avg latency</div>
                  <div className="font-mono text-xs text-blue-400">99.9% success rate</div>
                </div>
              </div>
            </div>
          </div>

          {/* Complete Platform */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Complete inbound Email Platform</h2>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto text-left">
              {/* Email Infrastructure */}
              <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
                <CustomInboundIcon 
                  backgroundColor="#1C2894" 
                  Icon={Database2} 
                  size={48}
                  className="mb-6"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-3">Email Infrastructure</h3>
                <p className="text-gray-600 mb-4">
                  Complete email receiving, routing, and processing infrastructure built on AWS.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Custom domain support</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Unlimited email aliases</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Catch-all configuration</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">DNS management</span>
                  </div>
                </div>
              </div>

              {/* Developer Tools */}
              <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
                <CustomInboundIcon 
                  backgroundColor="#6C47FF" 
                  Icon={Code2} 
                  size={48}
                  className="mb-6"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-3">Developer Tools</h3>
                <p className="text-gray-600 mb-4">
                  Modern SDK, comprehensive APIs, and developer-friendly tools for email integration.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">TypeScript SDK</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">REST API documentation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Webhook testing tools</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Real-time logs</span>
                  </div>
                </div>
              </div>

              {/* AI & Automation */}
              <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
                <CustomInboundIcon 
                  backgroundColor="#10b981" 
                  Icon={Microchip} 
                  size={48}
                  className="mb-6"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-3">AI & Automation</h3>
                <p className="text-gray-600 mb-4">
                  Built for AI agents and automation workflows with structured data and conversation threading.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">AI-ready data format</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Conversation threading</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Auto-reply capabilities</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Workflow triggers</span>
                  </div>
                </div>
              </div>

              {/* Enterprise Security */}
              <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
                <CustomInboundIcon 
                  backgroundColor="#dc2626" 
                  Icon={ShieldCheck} 
                  size={48}
                  className="mb-6"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-3">Enterprise Security</h3>
                <p className="text-gray-600 mb-4">
                  Built-in security with SPF/DKIM/DMARC validation, spam filtering, and malware detection.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Authentication validation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Spam & malware filtering</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">HTTPS-only webhooks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-sm text-gray-700">Signed webhook payloads</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* How It Works */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">How inbound Email Processing Works</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              From email receipt to structured data delivery in your application - all automated.
            </p>

            <div className="max-w-4xl mx-auto text-left">
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">Complete Email Processing Flow</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`// 1. Setup your inbound email service
import { createInboundClient } from '@inboundemail/sdk'

const inbound = createInboundClient({
  apiKey: process.env.INBOUND_API_KEY
})

// 2. Configure domain and email addresses
await inbound.domains.create({
  domain: 'yourapp.com',
  dnsRecords: 'auto'  // Auto-generate DNS records
})

await inbound.emails.create({
  email: 'support@yourapp.com', 
  webhookUrl: 'https://api.yourapp.com/webhook'
})

// 3. Handle processed emails in your app
app.post('/webhook', (req, res) => {
  const { email }: InboundWebhookPayload = req.body
  
  // Rich, structured email data
  const parsed = email.parsedData
  
  // Customer info (fully typed)
  const customer = {
    email: parsed.from.address,
    name: parsed.from.name
  }
  
  // Email content & metadata
  const content = {
    subject: parsed.subject,
    text: parsed.textBody,
    html: parsed.htmlBody,
    attachments: parsed.attachments
  }
  
  // Threading & conversation data
  const thread = {
    messageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references
  }
  
  // Process the email data...
  await processCustomerEmail(customer, content, thread)
  
  res.status(200).json({ success: true })
})`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Perfect for Every inbound Email Use Case</h2>
            
            <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto text-left">
              {/* Customer Support */}
              <div className="bg-linear-to-br from-blue-50 to-blue-100 rounded-xl p-8 border border-blue-200">
                <CustomInboundIcon 
                  backgroundColor="#3b82f6" 
                  Icon={Envelope2} 
                  size={40}
                  className="mb-4"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-3">Customer Support</h3>
                <p className="text-gray-600 mb-4">
                  Turn support emails into tickets, route to the right team, and enable AI-powered responses.
                </p>
                <div className="space-y-2">
                  <div className="text-sm text-gray-700">✓ Auto-ticket creation</div>
                  <div className="text-sm text-gray-700">✓ Smart routing rules</div>
                  <div className="text-sm text-gray-700">✓ AI response generation</div>
                </div>
              </div>

              {/* Lead Management */}
              <div className="bg-linear-to-br from-green-50 to-green-100 rounded-xl p-8 border border-green-200">
                <CustomInboundIcon 
                  backgroundColor="#10b981" 
                  Icon={Globe2} 
                  size={40}
                  className="mb-4"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-3">Lead Management</h3>
                <p className="text-gray-600 mb-4">
                  Capture and qualify leads from contact forms, integrate with CRM, and trigger follow-ups.
                </p>
                <div className="space-y-2">
                  <div className="text-sm text-gray-700">✓ Lead extraction & scoring</div>
                  <div className="text-sm text-gray-700">✓ CRM integration</div>
                  <div className="text-sm text-gray-700">✓ Automated follow-up sequences</div>
                </div>
              </div>

              {/* System Monitoring */}
              <div className="bg-linear-to-br from-red-50 to-red-100 rounded-xl p-8 border border-red-200">
                <CustomInboundIcon 
                  backgroundColor="#dc2626" 
                  Icon={ShieldCheck} 
                  size={40}
                  className="mb-4"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-3">System Monitoring</h3>
                <p className="text-gray-600 mb-4">
                  Parse monitoring alerts, server notifications, and system reports for DevOps workflows.
                </p>
                <div className="space-y-2">
                  <div className="text-sm text-gray-700">✓ Alert parsing & routing</div>
                  <div className="text-sm text-gray-700">✓ Incident creation</div>
                  <div className="text-sm text-gray-700">✓ Slack/Discord integration</div>
                </div>
              </div>

              {/* E-commerce */}
              <div className="bg-linear-to-br from-purple-50 to-purple-100 rounded-xl p-8 border border-purple-200">
                <CustomInboundIcon 
                  backgroundColor="#8b5cf6" 
                  Icon={Settings3} 
                  size={40}
                  className="mb-4"
                />
                <h3 className="text-xl font-bold text-gray-900 mb-3">E-commerce Automation</h3>
                <p className="text-gray-600 mb-4">
                  Process order confirmations, shipping updates, and customer communications automatically.
                </p>
                <div className="space-y-2">
                  <div className="text-sm text-gray-700">✓ Order tracking</div>
                  <div className="text-sm text-gray-700">✓ Shipping notifications</div>
                  <div className="text-sm text-gray-700">✓ Customer service routing</div>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">Start Free, Scale Affordably</h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              Begin with 1,000 emails free every month. No setup fees, no hidden costs, no vendor lock-in.
            </p>
            <PricingTable />
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Ready to Build with Professional inbound Email?</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join thousands of developers who trust inbound for reliable, modern email processing infrastructure.
            </p>
            
            <div className="flex items-center gap-4 max-w-md mx-auto mb-6">
              <Input type="email" placeholder="your@domain.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Start Building Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Start Building Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>

            <p className="text-sm text-gray-500">
              ✓ 1,000 emails/month free ✓ Complete email platform ✓ TypeScript SDK ✓ 5-minute setup
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

