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
import Gear2 from "@/components/icons/gear-2"
import PaperPlane2 from "@/components/icons/paper-plane-2"
import Cube2 from "@/components/icons/cube-2"

export const metadata: Metadata = {
  title: 'Email API for Developers - Send, Receive & Process Emails | inbound',
  description: 'Complete email API platform for developers. Send transactional emails, receive inbound emails, and process with webhooks. TypeScript SDK, REST API, and 99.9% deliverability.',
  keywords: [
    'email API',
    'email API for developers',
    'send email API',
    'receive email API', 
    'email processing API',
    'transactional email API',
    'inbound email API',
    'email infrastructure API',
    'email webhook API',
    'email parsing API',
    'TypeScript email API',
    'REST email API',
    'email automation API',
    'programmable email',
    'email platform API',
    'developer email service',
    'email integration API',
    'modern email API'
  ],
  openGraph: {
    title: 'Email API for Developers - Send, Receive & Process Emails',
    description: 'Complete email API platform for developers. Send transactional emails, receive inbound emails, and process with webhooks. TypeScript SDK included.',
    type: 'website',
    url: 'https://inbound.new/email-api',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Email API for Developers - Send, Receive & Process Emails',
    description: 'Complete email API platform for developers. Send transactional emails, receive inbound emails, and process with webhooks.',
  },
  alternates: {
    canonical: 'https://inbound.new/email-api'
  }
}

export default async function EmailAPIPage() {
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
              <span className="text-[#1C2894]">Email API</span>
              <br />
              for Developers
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-2xl mx-auto leading-relaxed">
              Send, receive, and process emails with one simple API. Get TypeScript SDK, webhook integration, 
              and 99.9% deliverability without the complexity of legacy email services.
            </p>

            <div className="flex items-center gap-4 max-w-md mx-auto mt-8">
              <Input type="email" placeholder="api@yourapp.com" />
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
              No credit card required • 1,000 emails/month free • TypeScript SDK included
            </p>
          </div>

          {/* API Capabilities */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Complete Email API Platform</h2>
            
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Send Emails */}
              <div className="bg-linear-to-br from-blue-50 to-blue-100 rounded-xl p-8 border border-blue-200">
                <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <PaperPlane2 width="32" height="32" className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Send Email API</h3>
                <p className="text-gray-600 mb-4">
                  Send transactional emails, notifications, and campaigns with high deliverability and real-time tracking.
                </p>
                <div className="bg-gray-800 rounded-lg p-3 text-left">
                  <div className="font-mono text-xs text-green-400">await inbound.emails.send({`{`}</div>
                  <div className="font-mono text-xs text-gray-400">  from, to, subject, html</div>
                  <div className="font-mono text-xs text-green-400">{`})`}</div>
                </div>
              </div>

              {/* Receive Emails */}
              <div className="bg-linear-to-br from-green-50 to-green-100 rounded-xl p-8 border border-green-200">
                <div className="w-16 h-16 bg-green-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Envelope2 width="32" height="32" className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Receive Email API</h3>
                <p className="text-gray-600 mb-4">
                  Process inbound emails with webhooks, structured parsing, and automatic routing to your application.
                </p>
                <div className="bg-gray-800 rounded-lg p-3 text-left">
                  <div className="font-mono text-xs text-blue-400">POST /webhook</div>
                  <div className="font-mono text-xs text-gray-400">  parsed email data</div>
                  <div className="font-mono text-xs text-green-400">  structured & typed</div>
                </div>
              </div>

              {/* Process Emails */}
              <div className="bg-linear-to-br from-purple-50 to-purple-100 rounded-xl p-8 border border-purple-200">
                <div className="w-16 h-16 bg-purple-600 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Gear2 width="32" height="32" className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Process Email API</h3>
                <p className="text-gray-600 mb-4">
                  Parse, analyze, and extract data from emails with AI-powered content analysis and automation.
                </p>
                <div className="bg-gray-800 rounded-lg p-3 text-left">
                  <div className="font-mono text-xs text-purple-400">GET /emails/{`{id}`}</div>
                  <div className="font-mono text-xs text-gray-400">  full email data</div>
                  <div className="font-mono text-xs text-green-400">  with attachments</div>
                </div>
              </div>
            </div>
          </div>

          {/* Developer Experience */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Built for Developer Productivity</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Skip weeks of email infrastructure setup. Get production-ready email APIs in minutes.
            </p>

            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto text-left">
              {/* TypeScript SDK */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">TypeScript SDK</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`import { createInboundClient } from '@inboundemail/sdk'

const inbound = createInboundClient({
  apiKey: process.env.INBOUND_API_KEY
})

// Send emails (Resend-compatible)
await inbound.emails.send({
  from: 'hello@yourapp.com',
  to: 'user@example.com', 
  subject: 'Welcome!',
  html: '<h1>Thanks for signing up!</h1>'
})

// Setup inbound processing
await inbound.emails.create({
  email: 'support@yourapp.com',
  webhookUrl: 'https://api.yourapp.com/webhook'
})

// All methods are fully typed with IntelliSense`}
                  </pre>
                </div>
              </div>

              {/* REST API */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">REST API</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`# Send Email
POST https://api.inbound.new/v2/emails
{
  "from": "hello@yourapp.com",
  "to": "user@example.com",
  "subject": "Welcome!", 
  "html": "<h1>Thanks for signing up!</h1>"
}

# Create Email Address
POST https://api.inbound.new/v2/email-addresses
{
  "email": "support@yourapp.com",
  "webhookUrl": "https://api.yourapp.com/webhook"
}

# Get Email Data
GET https://api.inbound.new/v2/emails/{id}

# Standard REST with proper HTTP codes`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* API Features */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Professional Email API Features</h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {/* High Deliverability */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck width="32" height="32" className="text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">99.9% Deliverability</h3>
                <p className="text-gray-600 text-sm">
                  Built on AWS SES with proper authentication, reputation management, and ISP relationships.
                </p>
              </div>

              {/* Real-time Processing */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Timer width="32" height="32" className="text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Real-time Processing</h3>
                <p className="text-gray-600 text-sm">
                  Emails processed and webhooks delivered within 2 seconds. No delays or queue bottlenecks.
                </p>
              </div>

              {/* Webhook Integration */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BoltLightning width="32" height="32" className="text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Webhook Integration</h3>
                <p className="text-gray-600 text-sm">
                  Reliable webhook delivery with automatic retries, HMAC signatures, and failure handling.
                </p>
              </div>

              {/* TypeScript Support */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Code2 width="32" height="32" className="text-indigo-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">TypeScript First</h3>
                <p className="text-gray-600 text-sm">
                  Native TypeScript support with full type definitions and IntelliSense for faster development.
                </p>
              </div>

              {/* Structured Data */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-yellow-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Database2 width="32" height="32" className="text-yellow-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Structured Data</h3>
                <p className="text-gray-600 text-sm">
                  Clean, parsed email data with headers, content, attachments, and metadata extraction.
                </p>
              </div>

              {/* Enterprise Scale */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Cube2 width="32" height="32" className="text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Enterprise Scale</h3>
                <p className="text-gray-600 text-sm">
                  Handle millions of emails with auto-scaling infrastructure and enterprise-grade security.
                </p>
              </div>
            </div>
          </div>

          {/* API Comparison */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">The Email API That Actually Works</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Compare our modern email API approach with traditional email services.
            </p>

            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto text-left">
              {/* Traditional Email APIs */}
              <div className="bg-gray-50 rounded-xl p-8 border border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-6">Traditional Email APIs</h3>
                
                <div className="space-y-4">
                  <div className="text-gray-600">• Complex authentication setup</div>
                  <div className="text-gray-600">• Separate services for send vs receive</div>
                  <div className="text-gray-600">• Manual email parsing required</div>
                  <div className="text-gray-600">• No TypeScript support</div>
                  <div className="text-gray-600">• Limited webhook capabilities</div>
                  <div className="text-gray-600">• High per-email costs</div>
                </div>

                <div className="mt-6 bg-gray-100 rounded-lg p-4">
                  <p className="text-gray-700 font-semibold">Result: Weeks of development time</p>
                </div>
              </div>

              {/* inbound Email API */}
              <div className="bg-linear-to-br from-blue-50 to-purple-50 rounded-xl p-8 border border-blue-200">
                <h3 className="text-xl font-bold text-gray-900 mb-6">inbound Email API</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-gray-700">One API key for everything</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-gray-700">Unified send & receive platform</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-gray-700">Automatic email parsing</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-gray-700">Full TypeScript SDK</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-gray-700">Advanced webhook system</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check2 width="16" height="16" className="text-green-500" />
                    <span className="text-gray-700">Affordable, predictable pricing</span>
                  </div>
                </div>

                <div className="mt-6 bg-green-100 rounded-lg p-4">
                  <p className="text-green-700 font-semibold">Result: Production-ready in minutes</p>
                </div>
              </div>
            </div>
          </div>

          {/* Code Examples */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Email API in Action</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              See how simple it is to integrate email functionality into your application.
            </p>

            <div className="space-y-8 max-w-4xl mx-auto text-left">
              {/* Send Email Example */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">Send Transactional Email</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`// Send welcome email after user signup
const result = await inbound.emails.send({
  from: 'welcome@yourapp.com',
  to: user.email,
  subject: 'Welcome to our platform!',
  html: \`
    <h1>Welcome \${user.name}!</h1>
    <p>Thanks for signing up. Get started here:</p>
    <a href="https://yourapp.com/onboarding">Complete Setup</a>
  \`,
  tags: [
    { name: 'type', value: 'welcome' },
    { name: 'userId', value: user.id }
  ]
})

console.log('Email sent:', result.messageId)`}
                  </pre>
                </div>
              </div>

              {/* Receive Email Example */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">Process inbound Email</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`// Handle support emails automatically
app.post('/webhooks/support', (req, res) => {
  const { email }: InboundWebhookPayload = req.body
  
  // Extract customer data
  const customer = {
    email: email.parsedData.from.address,
    name: email.parsedData.from.name
  }
  
  // Create support ticket
  const ticket = await createSupportTicket({
    customer,
    subject: email.parsedData.subject,
    content: email.parsedData.textBody,
    attachments: email.parsedData.attachments,
    messageId: email.parsedData.messageId
  })
  
  // Auto-reply with ticket number
  await inbound.emails.reply(email, {
    from: 'support@yourapp.com',
    html: \`Thanks! Your ticket #\${ticket.id} has been created.\`
  })
  
  res.json({ success: true, ticketId: ticket.id })
})`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">Simple Email API Pricing</h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              Transparent pricing with generous free tiers. No hidden fees or per-feature charges.
            </p>
            <PricingTable />
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Ready to Build with Modern Email APIs?</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join thousands of developers who chose inbound for reliable, modern email infrastructure.
            </p>
            
            <div className="flex items-center gap-4 max-w-md mx-auto mb-6">
              <Input type="email" placeholder="your@domain.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Start Building
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Start Building
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>

            <p className="text-sm text-gray-500">
              ✓ 1,000 emails/month free ✓ TypeScript SDK ✓ Complete email platform ✓ 5-minute setup
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

