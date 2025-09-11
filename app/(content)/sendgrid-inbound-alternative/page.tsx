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
import ShieldCheck from "@/components/icons/shield-check"
import CircleCheck from "@/components/icons/circle-check"
import BoltLightning from "@/components/icons/bolt-lightning"
import TabClose from "@/components/icons/tab-close"
import Microchip from "@/components/icons/microchip"
import CircleSparkle from "@/components/icons/circle-sparkle"
import Check2 from "@/components/icons/check-2"
import InboundIcon from "@/components/icons/inbound"
import Code2 from "@/components/icons/code-2"
import Clock2 from "@/components/icons/clock-2"
import Database2 from "@/components/icons/database-2"

export const metadata: Metadata = {
  title: 'Best SendGrid Inbound Parse Alternative - Modern Email Webhook API | inbound',
  description: 'Replace SendGrid Inbound Parse with modern email processing. Get TypeScript SDK, structured data, and real-time webhooks. Better parsing, lower cost.',
  keywords: [
    'SendGrid Inbound Parse alternative',
    'SendGrid replacement',
    'inbound email parsing',
    'email webhook API',
    'email to webhook service',
    'email parsing service',
    'SendGrid alternative',
    'TypeScript email SDK',
    'structured email data',
    'email infrastructure API',
    'webhook email processing',
    'better than SendGrid'
  ],
  openGraph: {
    title: 'Best SendGrid Inbound Parse Alternative - Modern Email Webhook API',
    description: 'Replace SendGrid Inbound Parse with modern email processing. Get TypeScript SDK, structured data, and real-time webhooks.',
    type: 'website',
    url: 'https://inbound.new/sendgrid-inbound-alternative',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Best SendGrid Inbound Parse Alternative - Modern Email Webhook API',
    description: 'Replace SendGrid Inbound Parse with modern email processing. Get TypeScript SDK, structured data, and real-time webhooks.',
  },
  alternates: {
    canonical: 'https://inbound.new/sendgrid-inbound-alternative'
  }
}

export default async function SendGridAlternativePage() {
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
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <CircleCheck width="16" height="16" />
              The Modern SendGrid Inbound Parse Alternative
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              <span className="text-[#1C2894]">SendGrid Inbound Parse</span>
              <br />
              Alternative for Modern Devs
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-2xl mx-auto leading-relaxed">
              Ditch SendGrid's outdated inbound parsing for a modern TypeScript-first email webhook API. 
              Get structured data, real-time processing, and better developer experience at a fraction of the cost.
            </p>

            <div className="flex items-center gap-4 max-w-md mx-auto mt-8">
              <Input type="email" placeholder="support@yourapp.com" />
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
              No credit card required • 1,000 emails/month free • Modern TypeScript SDK
            </p>
          </div>

          {/* Comparison Section */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Why Developers Are Leaving SendGrid Inbound Parse</h2>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto text-left">
              {/* SendGrid Column */}
              <div className="bg-gray-50 rounded-xl p-8 border border-gray-200">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">
                    SG
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">SendGrid Inbound Parse</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <TabClose width="20" height="20" className="text-red-500 mt-0.5 shrink-0" />
                    <span className="text-gray-600">Legacy webhook format</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <TabClose width="20" height="20" className="text-red-500 mt-0.5 shrink-0" />
                    <span className="text-gray-600">Manual form data parsing required</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <TabClose width="20" height="20" className="text-red-500 mt-0.5 shrink-0" />  
                    <span className="text-gray-600">No TypeScript support or SDK</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <TabClose width="20" height="20" className="text-red-500 mt-0.5 shrink-0" />
                    <span className="text-gray-600">Complex attachment handling</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <TabClose width="20" height="20" className="text-red-500 mt-0.5 shrink-0" />
                    <span className="text-gray-600">No email threading or conversation tracking</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <TabClose width="20" height="20" className="text-red-500 mt-0.5 shrink-0" />
                    <span className="text-gray-600">Part of expensive email platform</span>
                  </div>
                </div>
              </div>

              {/* inbound Column */}
              <div className="bg-linear-to-br from-blue-50 to-purple-50 rounded-xl p-8 border border-blue-200">
                <div className="flex items-center gap-3 mb-6">
                  <CustomInboundIcon
                    className="shrink-0"
                    backgroundColor="#1C2894"
                    Icon={CircleSparkle}
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">inbound by exon</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">Modern JSON webhook payloads</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">Structured, parsed email data</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">Full TypeScript SDK with types</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">Automatic attachment processing</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">Email threading & conversation tracking</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">Dedicated email processing platform</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Features Section */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Modern Email Processing Features</h2>
            
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* TypeScript First */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Code2 width="32" height="32" className="text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">TypeScript First</h3>
                <p className="text-gray-600">
                  Full type safety with IntelliSense. Never guess webhook payload structure again.
                </p>
              </div>

              {/* Structured Data */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Database2 width="32" height="32" className="text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Structured Data</h3>
                <p className="text-gray-600">
                  Get parsed headers, body content, attachments, and metadata in a clean JSON format.
                </p>
              </div>

              {/* Real-time Processing */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Clock2 width="32" height="32" className="text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Real-time Processing</h3>
                <p className="text-gray-600">
                  Webhooks delivered within seconds of email receipt. No delays or queuing issues.
                </p>
              </div>

              {/* Email Threading */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-yellow-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BoltLightning width="32" height="32" className="text-yellow-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Email Threading</h3>
                <p className="text-gray-600">
                  Automatic conversation threading and In-Reply-To tracking for context-aware processing.
                </p>
              </div>

              {/* Easy Setup */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Microchip width="32" height="32" className="text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Easy Setup</h3>
                <p className="text-gray-600">
                  One-click webhook configuration. No complex domain authentication or MX record guessing.
                </p>
              </div>

              {/* Reliable Delivery */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck width="32" height="32" className="text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Reliable Delivery</h3>
                <p className="text-gray-600">
                  Automatic retries, failure handling, and delivery tracking. 99.9% webhook success rate.
                </p>
              </div>
            </div>
          </div>

          {/* Code Comparison */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">See The Difference</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Compare the developer experience between SendGrid's legacy inbound parse and inbound's modern approach.
            </p>

            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto text-left">
              {/* SendGrid Code */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">SendGrid Inbound Parse</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`// SendGrid webhook handler
app.post('/sendgrid-webhook', (req, res) => {
  // Parse form data manually
  const email = {
    from: req.body.from,
    to: req.body.to,
    subject: req.body.subject,
    text: req.body.text,
    html: req.body.html
  }
  
  // Handle attachments manually
  const attachmentCount = parseInt(
    req.body.attachment_info || '0'
  )
  
  const attachments = []
  for (let i = 1; i <= attachmentCount; i++) {
    if (req.files[\`attachment\${i}\`]) {
      // Manual file processing...
    }
  }
  
  // No type safety, manual parsing
  console.log('Subject:', email.subject)
  res.status(200).send('OK')
})`}
                  </pre>
                </div>
              </div>

              {/* inbound Code */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">inbound TypeScript SDK</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`// inbound webhook handler (TypeScript)
app.post('/inbound-webhook', (req, res) => {
  const { email }: InboundWebhookPayload = req.body
  
  // Fully typed, structured data
  const parsedEmail = email.parsedData
  
  // Type-safe access to all fields
  console.log('From:', parsedEmail.from.address)
  console.log('Subject:', parsedEmail.subject)
  console.log('Text:', parsedEmail.textBody)
  console.log('HTML:', parsedEmail.htmlBody)
  
  // Attachments already processed
  parsedEmail.attachments.forEach(attachment => {
    console.log('File:', attachment.filename)
    console.log('Size:', attachment.size)
    console.log('Type:', attachment.contentType)
  })
  
  // IntelliSense works perfectly
  res.status(200).json({ success: true })
})`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Migration Guide */}
          <div className="mb-32">
            <div className="bg-linear-to-br from-green-50 to-blue-50 rounded-2xl p-12 border border-green-200 text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Migrate from SendGrid in Minutes</h2>
              <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
                Keep your existing email flow while upgrading to modern, structured email processing.
              </p>

              <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left mb-8">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Setup Domain</h3>
                    <p className="text-gray-600 text-sm">Add your domain to inbound and verify with simple DNS records.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Create Webhooks</h3>
                    <p className="text-gray-600 text-sm">Replace SendGrid webhook URLs with inbound endpoints.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Update Code</h3>
                    <p className="text-gray-600 text-sm">Replace form parsing with typed webhook payloads.</p>
                  </div>
                </div>
              </div>

              <Button variant="primary" size="lg" asChild>
                {session ? (
                  <Link href="/add" className="flex items-center gap-2">
                    Start Migration Now
                    <ArrowBoldRight width="16" height="16" />
                  </Link>
                ) : (
                  <Link href="/login" className="flex items-center gap-2">
                    Start Migration Now
                    <ArrowBoldRight width="16" height="16" />
                  </Link>
                )}
              </Button>
            </div>
          </div>

          {/* Pricing */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">Simple, Affordable Pricing</h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              No hidden fees or complex SendGrid add-on pricing. Pay only for what you use with generous free tiers.
            </p>
            <PricingTable />
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Ready for Modern Email Processing?</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join developers who switched from SendGrid's legacy inbound parse to our TypeScript-first email platform.
            </p>
            
            <div className="flex items-center gap-4 max-w-md mx-auto mb-6">
              <Input type="email" placeholder="your@domain.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Get Started Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Get Started Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>

            <p className="text-sm text-gray-500">
              ✓ 1,000 emails/month free ✓ TypeScript SDK ✓ No setup fees ✓ 5-minute migration
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

