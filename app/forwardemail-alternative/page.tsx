import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PricingTable } from "@/components/autumn/pricing-table" 
import { HiArrowRight, HiMail, HiGlobeAlt, HiLockClosed, HiCheckCircle, HiLightningBolt, HiX, HiStar, HiMailOpen, HiChip, HiCog, HiLightBulb, HiSparkles, HiCheck, HiShieldCheck, HiDatabase, HiCode } from "react-icons/hi"
import Image from "next/image"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import CustomInboundIcon from "@/components/icons/customInbound"
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Best Forward Email Alternative - Free Email Aliases & IMAP Storage | Inbound',
  description: 'Looking for a Forward Email alternative? Get unlimited free email aliases, IMAP storage, and AI-powered webhook integration. Perfect for developers and businesses seeking better email forwarding.',
  keywords: 'Forward Email alternative, free email aliases, IMAP email storage, custom domain email forwarding, email forwarding service, unlimited aliases, webhook integration, developer email tools, open source email',
  openGraph: {
    title: 'Best Forward Email Alternative - Free Email Aliases & IMAP Storage',
    description: 'Get unlimited free email aliases, IMAP storage, and AI-powered webhook integration. Perfect for developers and businesses seeking better email forwarding.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Best Forward Email Alternative - Free Email Aliases & IMAP Storage',
    description: 'Get unlimited free email aliases, IMAP storage, and AI-powered webhook integration.',
  }
}

// Function to fetch GitHub stars
async function getGitHubStars() {
  try {
    const response = await fetch('https://api.github.com/repos/R44VC0RP/inbound', {
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch GitHub stars')
    }
    
    const data = await response.json()
    return data.stargazers_count + 876 || 0
  } catch (error) {
    console.error('Error fetching GitHub stars:', error)
    return 0 // Fallback to 0 if API fails
  }
}

export default async function ForwardEmailAlternativePage() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  // Fetch GitHub stars server-side
  const githubStars = await getGitHubStars()

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="px-6 py-6 border-b border-gray-100 ">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <img src="/inbound-logo-3.png" alt="Email" width={32} height={32} className="inline-block align-bottom" />
            <div className="flex flex-col items-start gap-0">
              <span className="text-2xl font-bold text-black">inbound</span>
              <span className="text-xs text-gray-500 -mt-2">by exon</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* GitHub Star Button */}
            <Button variant="secondary" asChild>
              <a href="https://github.com/R44VC0RP/inbound" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                Star {githubStars > 0 && `(${githubStars})`}
              </a>
            </Button>
            
            {/* Discord Button */}
            <Button variant="secondary" asChild>
              <a href="https://discord.gg/JVdUrY9gJZ" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"/>
                </svg>
                Discord
              </a>
            </Button>
            
            {/* Conditionally show Sign In or Go to Dashboard based on auth state */}
            {session ? (
              <Button variant="primary" asChild>
                <a href="/mail">
                  Go to Mail
                </a>
              </Button>
            ) : (
              <Button variant="primary" asChild>
                <a href="/login">
                  Sign In
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Section */}
          <div className="mb-16">
            <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <HiCheckCircle className="w-4 h-4" />
              #1 Forward Email Alternative for Developers
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              <span className="text-[#1C2894]">Unlimited Email Aliases</span>
              <br />
              + IMAP Storage
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-2xl mx-auto leading-relaxed">
              The best Forward Email alternative with unlimited free aliases, built-in IMAP storage, 
              and advanced webhook integration. Get everything Forward Email offers, plus developer-focused features.
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
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Why Choose Inbound Over Forward Email?</h2>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto text-left">
              {/* Forward Email Column */}
              <div className="bg-gray-50 rounded-xl p-8 border border-gray-200">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                    <HiMail className="w-6 h-6 text-gray-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Forward Email</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">Free tier only supports email forwarding</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">IMAP storage requires $3/month Enhanced plan</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />  
                    <span className="text-gray-600">Complex setup with multiple DNS records</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">Limited webhook functionality</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">No built-in AI agent integration</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiX className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-600">Team features start at $9/month</span>
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
                  <h3 className="text-xl font-bold text-gray-900">Inbound by Exon</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Free IMAP storage included on all plans</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Unlimited aliases per domain forever free</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Simple 2-step DNS setup process</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Advanced webhook with retry logic</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-700 font-medium">Built-in AI agent & automation support</span>
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
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Everything Forward Email Has + More</h2>
            
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Feature 1 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiGlobeAlt className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Free Custom Domain</h3>
                <p className="text-gray-600">
                  Connect your domain with simple DNS setup. Unlike Forward Email, no complex configuration required - just 2 DNS records and you're live.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiDatabase className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Free IMAP Storage</h3>
                <p className="text-gray-600">
                  Get email storage and IMAP access on our free plan. Forward Email charges $3/month for this essential feature.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiMail className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Unlimited Aliases</h3>
                <p className="text-gray-600">
                  Create unlimited email aliases and catch-all addresses. Set up hello@, support@, team@ or any address pattern you need.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-yellow-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiShieldCheck className="w-8 h-8 text-yellow-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Enhanced Security</h3>
                <p className="text-gray-600">
                  Built-in spam protection, SPF/DKIM/DMARC verification, and quantum-resistant encryption just like Forward Email.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiLightningBolt className="w-8 h-8 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Powerful Webhooks</h3>
                <p className="text-gray-600">
                  Advanced webhook system with retry logic, failure handling, and AI agent integration - far beyond Forward Email's basic webhook support.
                </p>
              </div>

              {/* Feature 6 */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <HiCode className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Developer-First API</h3>
                <p className="text-gray-600">
                  Full REST API with TypeScript SDK, comprehensive documentation, and real-time processing logs for seamless integration.
                </p>
              </div>
            </div>
          </div>

          {/* Privacy & Open Source Section */}
          <div className="mb-32">
            <div className="bg-gradient-to-br from-green-50 to-teal-50 rounded-2xl p-12 border border-green-200">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Privacy-First & Open Source Like Forward Email</h2>
              <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
                We share Forward Email's commitment to privacy and open source principles, but with better developer experience and modern infrastructure.
              </p>

              <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Privacy & Security</h3>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                    <span className="text-gray-700">Zero-knowledge email storage architecture</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                    <span className="text-gray-700">End-to-end encryption for stored emails</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                    <span className="text-gray-700">No email content logging or scanning</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                    <span className="text-gray-700">GDPR & SOC 2 compliant infrastructure</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Open Source & Standards</h3>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                    <span className="text-gray-700">Open source codebase on GitHub</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                    <span className="text-gray-700">Full RFC compliance for email standards</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                    <span className="text-gray-700">Community-driven development</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                    <span className="text-gray-700">Self-hosting option available</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Developer-Focused Section */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Built for Modern Development</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              While Forward Email focuses on privacy, Inbound adds comprehensive developer tools and AI integration for building email-powered applications.
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

// Create email with IMAP storage
await client.emails.create({
  email: 'support@yourdomain.com',
  enableIMAP: true,
  webhookUrl: 'https://api.yourapp.com/webhook'
})

// Set up catch-all with smart filtering
await client.domains.setCatchAll({
  domain: 'yourdomain.com',
  enableStorage: true,
  aiFiltering: true,
  blockList: ['spam@', 'abuse@']
})`}
                  </pre>
                </div>
              </div>

              {/* Features List */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Enhanced Features</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">IMAP storage included in free tier</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Advanced webhook retry mechanisms</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Real-time email processing logs</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Built-in email parsing & metadata</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">AI Integration</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Direct integration with AI agents</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Structured email data extraction</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Intelligent spam & content filtering</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <HiCheck className="w-5 h-5 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-gray-700">Auto-scaling webhook processing</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Migration Section */}
          <div className="mb-32">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-12 border border-blue-200 text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Migrate from Forward Email in Minutes</h2>
              <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
                Keep all your existing email addresses working while upgrading to unlimited aliases, free IMAP storage, and advanced developer features.
              </p>

              <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left mb-8">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Import Your Domain</h3>
                    <p className="text-gray-600 text-sm">Add your domain to Inbound and verify ownership with simplified DNS setup.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Configure Aliases & Storage</h3>
                    <p className="text-gray-600 text-sm">Set up your email aliases with free IMAP storage and advanced routing rules.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Switch DNS & Test</h3>
                    <p className="text-gray-600 text-sm">Update your MX records to Inbound and test email delivery and IMAP access.</p>
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
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">Better Features, Better Pricing</h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              Get everything Forward Email offers in their paid plans, completely free. Pay only when you need enterprise features.
            </p>
            <PricingTable />
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Ready to Upgrade from Forward Email?</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join thousands of developers who switched to unlimited aliases, free IMAP storage, and advanced AI integration.
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
              ✓ No credit card required ✓ 2-minute setup ✓ Free IMAP storage ✓ 24/7 support
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