import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PricingTable } from "@/components/autumn/pricing-table" 
import { HiArrowRight, HiMail, HiGlobeAlt, HiLockClosed, HiCheckCircle, HiLightningBolt, HiX, HiStar, HiMailOpen, HiChip, HiCog, HiLightBulb, HiSparkles, HiCheck } from "react-icons/hi"
import Image from "next/image"
import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import CustomInboundIcon from "@/components/icons/customInbound"
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Best ImprovMX Alternative - Free Email Aliases For Custom Domains | Inbound',
  description: 'Looking for an ImprovMX alternative? Get unlimited free email aliases, custom domain forwarding, and AI-powered webhook integration. Perfect for developers and businesses.',
  keywords: 'ImprovMX alternative, free email aliases, custom domain email forwarding, email forwarding service, unlimited aliases, webhook integration, developer email tools',
  openGraph: {
    title: 'Best ImprovMX Alternative - Free Email Aliases For Custom Domains',
    description: 'Get unlimited free email aliases, custom domain forwarding, and AI-powered webhook integration. Perfect for developers and businesses.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Best ImprovMX Alternative - Free Email Aliases For Custom Domains',
    description: 'Get unlimited free email aliases, custom domain forwarding, and AI-powered webhook integration.',
  }
}

export default async function ImprovMXAlternativePage() {
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
            <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <HiCheckCircle className="w-4 h-4" />
              #1 ImprovMX Alternative for Developers
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              <span className="text-[#1C2894]">Free Email Aliases</span>
              <br />
              For Custom Domains
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-2xl mx-auto leading-relaxed">
              The best ImprovMX alternative with unlimited free aliases, advanced webhook integration, 
              and powerful API access. Perfect for developers, AI agents, and growing businesses.
            </p>

            <div className="flex items-center gap-4 max-w-md mx-auto mt-8">
              <Input type="email" placeholder="hello@yourdomain.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <a href="/add">
                    Start Free
                    <HiArrowRight className="ml-2 w-3 h-3" />
                  </a>
                ) : (
                  <a href="/login">
                    Start Free
                    <HiArrowRight className="ml-2 w-3 h-3" />
                  </a>
                )}
              </Button>
            </div>

            <p className="text-sm text-gray-500 mt-3">
              No credit card required • Set up in 2 minutes • Forever free tier
            </p>
          </div>

          {/* Comparison Section */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Why Choose Inbound Over ImprovMX?</h2>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto text-left">
              {/* ImprovMX Column */}
              <div className="bg-gray-50 rounded-xl p-8 border border-gray-200">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                    <HiMail className="w-6 h-6 text-gray-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">ImprovMX</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">Limited to 25 free aliases</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">Paid plans start at $9/month</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />  
                    <span className="text-gray-600">No email storage or IMAP access</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">Basic webhook support</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">No AI agent integration</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">Limited API capabilities</span>
                  </div>
                </div>
              </div>

              {/* Inbound Column */}
              <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-8 border border-blue-200">
                <div className="flex items-center gap-3 mb-6">
                  <CustomInboundIcon
                    className="flex-shrink-0"
                    backgroundColor="#1C2894"
                    Icon={HiSparkles}
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">inbound by exon</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Unlimited free aliases per domain</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Forever free tier - no hidden costs</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Full catch-all domain support</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Advanced webhook integration</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">AI agent & automation ready</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Full REST API + TypeScript SDK</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Features Section */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Everything You Need for Custom Domain Email</h2>
            
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Feature 1 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiGlobeAlt className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">1 Free Domain</h3>
                <p className="text-gray-600">
                  Connect one custom domain completely free. Verify ownership with simple DNS configuration and start receiving emails instantly.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiMail className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Infinite Email Aliases</h3>
                <p className="text-gray-600">
                  Create unlimited individual aliases like hello@, support@, sales@ or set up a catch-all to receive emails sent to any address on your domain.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiLockClosed className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Granular Email Blocking</h3>
                <p className="text-gray-600">
                  Advanced blocking controls let you stop spam from specific addresses, domains, or patterns while keeping your catch-all active.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-yellow-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiLightningBolt className="w-8 h-8 text-yellow-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Webhook Integration</h3>
                <p className="text-gray-600">
                  Connect your email to any service or AI agent with reliable webhook delivery. Perfect for automation and custom workflows.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiChip className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">AI-Ready API</h3>
                <p className="text-gray-600">
                  Full REST API and TypeScript SDK for developers. Build email-powered AI agents and automate your email infrastructure.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiCheckCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Enterprise Security</h3>
                <p className="text-gray-600">
                  Built on AWS with enterprise-grade security, SPF/DKIM/DMARC support, and comprehensive email verification for high deliverability.
                </p>
              </div>
            </div>
          </div>

          {/* Developer-Focused Section */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Built for Developers & AI Builders</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Unlike ImprovMX, Inbound is designed from the ground up for developers who need programmatic email control and AI integration.
            </p>

            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto text-left">
              {/* Code Example */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">TypeScript SDK Example</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`import { createInboundClient } from 'exon-inbound'

const client = createInboundClient({
  apiKey: process.env.INBOUND_API_KEY
})

// Create a new email address
await client.emails.create({
  email: 'support@yourdomain.com',
  webhookUrl: 'https://api.yourapp.com/webhook'
})

// Set up catch-all for entire domain
await client.domains.setCatchAll({
  domain: 'yourdomain.com',
  webhookUrl: 'https://api.yourapp.com/webhook',
  blockList: ['spam@', 'abuse@']
})`}
                  </pre>
                </div>
              </div>

              {/* Features List */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Developer Experience</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Full TypeScript SDK with type safety</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Comprehensive REST API documentation</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Webhook retry & failure handling</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Real-time email processing logs</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">AI Integration</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Direct webhook delivery to AI agents</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Structured email parsing & metadata</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Auto-scaling email processing</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Built-in spam & security filtering</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Migration Section */}
          <div className="mb-32">
            <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-2xl p-12 border border-green-200 text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Migrate from ImprovMX in Minutes</h2>
              <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
                Switching from ImprovMX is simple. Keep your existing email addresses working while you transition to unlimited aliases and advanced features.
              </p>

              <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left mb-8">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Connect Your Domain</h3>
                    <p className="text-gray-600 text-sm">Add your domain to Inbound and verify ownership with DNS records.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Configure Email Routing</h3>
                    <p className="text-gray-600 text-sm">Set up your aliases or catch-all configuration with advanced blocking rules.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Update DNS & Go Live</h3>
                    <p className="text-gray-600 text-sm">Update your MX records to point to Inbound and start receiving emails.</p>
                  </div>
                </div>
              </div>

              <Button variant="primary" size="lg" asChild>
                {session ? (
                  <a href="/add" className="flex items-center gap-2">
                    Start Migration Now
                    <HiArrowRight className="w-4 h-4" />
                  </a>
                ) : (
                  <a href="/login" className="flex items-center gap-2">
                    Start Migration Now
                    <HiArrowRight className="w-4 h-4" />
                  </a>
                )}
              </Button>
            </div>
          </div>

          {/* Pricing */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">Transparent Pricing - No Surprises</h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              Start free and scale as you grow. Unlike ImprovMX, our free tier includes unlimited aliases on one domain.
            </p>
            <PricingTable />
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Ready to Switch from ImprovMX?</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join thousands of developers and businesses who have made the switch to unlimited email aliases and advanced automation.
            </p>
            
            <div className="flex items-center gap-4 max-w-md mx-auto mb-6">
              <Input type="email" placeholder="your@domain.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <a href="/add">
                    Get Started Free
                    <HiArrowRight className="ml-2 w-3 h-3" />
                  </a>
                ) : (
                  <a href="/login">
                    Get Started Free
                    <HiArrowRight className="ml-2 w-3 h-3" />
                  </a>
                )}
              </Button>
            </div>

            <p className="text-sm text-gray-500">
              ✓ No credit card required ✓ 5-minute setup ✓ Unlimited aliases ✓ 24/7 support
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <img src="/inbound-logo-3.png" alt="Inbound Logo" className="w-6 h-6" />
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