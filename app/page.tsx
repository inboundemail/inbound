import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import InboundIcon from "@/components/InboundIcon"
import { PricingTable } from "@/components/autumn/pricing-table"
import { ServicesDropdown } from "@/components/ServicesDropdown"
import { HiArrowRight, HiMail, HiGlobeAlt, HiLockClosed, HiCheckCircle, HiLightningBolt, HiArrowDown, HiX, HiStar, HiMailOpen, HiChip, HiCog, HiLightBulb, HiSparkles, HiShieldCheck, HiDatabase, HiUserGroup, HiCode, HiRefresh, HiClock } from "react-icons/hi"
import Image from "next/image"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import CustomInboundIcon from "@/components/icons/customInbound"
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Email Infrastructure for AI Agents & Developers | Turn Emails into Webhooks',
  description: 'Complete email infrastructure with TypeScript SDK, REST API, and AI-ready webhooks. Get 1 free domain, unlimited aliases, and enterprise-grade security. Perfect for AI agents and developers.',
  keywords: [
    'email infrastructure',
    'email to webhook',
    'TypeScript SDK',
    'REST API',
    'AI agents',
    'email forwarding',
    'unlimited aliases',
    'developer tools',
    'webhook integration',
    'email processing',
    'inbound email',
    'email automation',
    'catch-all email',
    'enterprise email security'
  ],
  openGraph: {
    title: 'Email Infrastructure for AI Agents & Developers',
    description: 'Complete email infrastructure with TypeScript SDK, REST API, and AI-ready webhooks. Get 1 free domain, unlimited aliases, and enterprise-grade security.',
    url: 'https://inbound.new',
    siteName: 'Inbound',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'Inbound - Email Infrastructure for AI Agents & Developers'
      }
    ],
    locale: 'en_US',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Email Infrastructure for AI Agents & Developers',
    description: 'Complete email infrastructure with TypeScript SDK, REST API, and AI-ready webhooks. Get 1 free domain, unlimited aliases, and enterprise-grade security.',
    images: ['/twitter-image.png']
  },
  alternates: {
    canonical: 'https://inbound.new'
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

export default async function HomePage() {
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
          <div className="flex items-center gap-4">
            {/* Services Dropdown */}
            <ServicesDropdown />
            
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
          <div className="mb-20">
            <div className="inline-flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <HiSparkles className="w-4 h-4" />
              #1 Email Infrastructure for AI Agents & Developers
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              turn
              <CustomInboundIcon
                className="inline-block ml-4 mr-2 align-bottom opacity-0 animate-[fadeInRotate_1s_ease-out_0.5s_forwards]"
                backgroundColor="#1C2894"
                Icon={HiMail}
                size={48}
              />
              <span className="text-[#1C2894]">emails</span>
              <br />
              into
              <CustomInboundIcon
                className="inline-block ml-4 mr-2 align-bottom opacity-0 animate-[fadeInRotate_1s_ease-out_1s_forwards]"
                backgroundColor="#6C47FF"
                Icon={HiLightningBolt}
                size={48}
              />
              <span className="text-[#6C47FF]">webhooks</span>
            </h1>
            <p className="text-xl text-gray-600 mb-6 max-w-3xl mx-auto leading-relaxed">
              Complete email infrastructure with <strong>TypeScript SDK</strong>, <strong>REST API</strong>, and <strong>AI-ready webhooks</strong>. 
              Get 1 free domain, unlimited aliases, and enterprise-grade security out of the box.
            </p>

            {/* Feature highlights */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-8 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <HiCheckCircle className="w-4 h-4 text-green-500" />
                <span>1 Free Domain</span>
              </div>
              <div className="flex items-center gap-2">
                <HiCheckCircle className="w-4 h-4 text-green-500" />
                <span>Unlimited Aliases</span>
              </div>
              <div className="flex items-center gap-2">
                <HiCheckCircle className="w-4 h-4 text-green-500" />
                <span>TypeScript SDK</span>
              </div>
              <div className="flex items-center gap-2">
                <HiCheckCircle className="w-4 h-4 text-green-500" />
                <span>AI Agent Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <HiCheckCircle className="w-4 h-4 text-green-500" />
                <span>Enterprise Security</span>
              </div>
            </div>

            <div className="flex items-center gap-4 max-w-md mx-auto">
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

          {/* Interactive Demo Section */}
          <div className="mb-32 text-left">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">watch your ai agent work</h2>

            <div className="max-w-4xl mx-auto">
              {/* Email Draft */}
              <div className="relative">
                <div className="bg-[#1A1A1A] rounded-xl shadow-lg overflow-hidden">
                  <div className="px-3 pt-3 pb-0">

                    <div className="space-y-3">
                      <div className="flex justify-between items-center border-b border-[#313135] pb-3">
                        <div className="flex items-center gap-2 justify-start">
                          <span className="text-[#8C8C8C] text-sm ">To:</span>
                          <span className="text-white text-sm ml-2 px-2 py-1 bg-[#2A2A2A] rounded-md gap-2 flex items-center">user@inbound.exon.dev <HiX className="w-4 h-4 text-[#8C8C8C] inline-block ml-2" /></span>
                        </div>
                        <button className="text-[#8C8C8C] hover:text-[#A8A8A8] text-sm ml-2">
                          Cc Bcc
                        </button>
                      </div>

                      <div className="flex items-center border-b border-[#313135] pb-3">
                        <span className="text-[#8C8C8C] text-sm w-20">Subject:</span>
                        <input
                          type="text"
                          value="Welcome to Inbound!"
                          readOnly
                          placeholder="Re: Design review feedback"
                          className="flex-1 bg-transparent text-white placeholder:text-[#797979] focus:outline-none text-sm"
                        />
                      </div>

                      <div className="min-h-[200px] pb-3 ">
                        <p className="text-white text-sm">
                          Hi there,
                          <br />
                          <br />
                          Thanks for trying out Inbound. This email will be received by your webhook endpoint...

                          <br />
                          <br />
                          <br />
                          <br />
                          Sent by <a href="https://0.email" target="_blank" className="text-white underline">0.email</a>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pb-3 pt-2 border-t border-[#313135]">
                      <div className="flex items-center gap-2">
                        <button className="flex items-center gap-2 px-2 py-1 bg-white text-black rounded-md text-sm font-medium hover:bg-gray-100 transition-colors">
                          Send
                          <div className="flex h-5 items-center justify-center gap-1 rounded-sm px-1 bg-black/10">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-command h-3.5 w-3.5 text-black">
                              <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3">
                              </path>
                            </svg>
                            <svg width="2em" height="2em" fill="none" xmlns="http://www.w3.org/2000/svg" className="mt-1.5 h-4 w-4 fill-black" viewBox="0 0 16 16">
                              <path d="M4.26465 11.0684C4.08008 11.0684 3.88184 10.9863 3.73828 10.8428L0.744141 7.90332C0.600586 7.75977 0.518555 7.55469 0.518555 7.35645C0.518555 7.1582 0.600586 6.95312 0.744141 6.81641L3.73828 3.87695C3.88184 3.7334 4.08008 3.64453 4.26465 3.64453C4.69531 3.64453 4.97559 3.94531 4.97559 4.35547C4.97559 4.57422 4.89355 4.73145 4.75684 4.86816L3.59473 5.98926L2.74707 6.68652L3.9707 6.625H10.335C10.8408 6.625 11.0391 6.42676 11.0391 5.9209V2.89941C11.0391 2.38672 10.8408 2.18848 10.335 2.18848H7.5459C7.11523 2.18848 6.80078 1.86035 6.80078 1.45703C6.80078 1.05371 7.11523 0.725586 7.5459 0.725586H10.3828C11.8594 0.725586 12.4814 1.34766 12.4814 2.82422V5.98926C12.4814 7.44531 11.8594 8.08789 10.3828 8.08789H3.9707L2.74707 8.0332L3.59473 8.72363L4.75684 9.85156C4.89355 9.98145 4.97559 10.1455 4.97559 10.3643C4.97559 10.7744 4.69531 11.0684 4.26465 11.0684Z">
                              </path>
                            </svg>
                          </div>

                        </button>
                        <button className="text-white text-sm font-normal flex items-center gap-1 bg-[#2B2B2B] px-2 py-1 rounded-md">
                          + Add
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm">sent via</span>
                        <svg width="12" height="12" viewBox="0 0 191 191" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M38.125 190.625V152.5H0V38.125H38.125V0H152.5V38.125H190.625V152.5H152.5V190.625H38.125ZM38.125 114.375H76.25V150.975H152.5V76.25H114.375V114.375H76.25V76.25H114.375V39.65H38.125V114.375Z" fill="white" />
                        </svg>
                        <button className="flex items-center gap-1 text-white text-sm bg-[#2B2B2B] px-2 py-1 rounded-md border-purple-500 border">
                          <HiSparkles className="w-4 h-4" />
                          Generate
                        </button>

                      </div>

                    </div>
                  </div>
                </div>
              </div>

              {/* Connecting Arrow */}
              <div className="flex items-center justify-center py-8">
                <div className="relative">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-gray-300 -translate-y-1/2"></div>
                  <div className="relative bg-white px-4">
                    <HiArrowDown className="w-6 h-6 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Email in Logs */}
              <div className="relative">
                <div className="bg-gray-900 rounded-xl shadow-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-800">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                      <HiMail className="w-4 h-4 text-green-400" />
                      Incoming Email Logs
                    </h3>
                  </div>
                  <div className="p-6 font-mono text-sm">
                    <div className="flex items-start gap-3 text-gray-300">
                      <span className="text-gray-500">{new Date().toLocaleTimeString()}</span>
                      <HiCheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
                      <div>
                        <div>Email received from <span className="text-white">sender@0.email</span></div>
                        <div className="text-gray-400">To: user@inbound.exon.dev</div>
                        <div className="text-gray-400">Subject: Welcome to Inbound!</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connecting Arrow */}
              <div className="flex items-center justify-center py-8">
                <div className="relative">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-gray-300 -translate-y-1/2"></div>
                  <div className="relative bg-white px-4">
                    <HiArrowDown className="w-6 h-6 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Webhook Trigger */}
              <div className="relative">
                <div className="bg-purple-50 rounded-xl shadow-lg overflow-hidden border border-purple-200">
                  <div className="px-6 py-4 border-b border-purple-200 bg-purple-100">
                    <h3 className="text-purple-900 font-semibold flex items-center gap-2">
                      <HiChip className="w-4 h-4 text-purple-600" />
                      AI Agent Processing
                    </h3>
                  </div>
                  <div className="p-6">
                    <div className="font-mono text-sm bg-white rounded-lg p-4 border border-purple-200">
                      <div className="text-purple-600">POST https://api.yourapp.com/agent/process-email</div>
                      <div className="mt-3 text-gray-700">
                        <pre className="whitespace-pre-wrap">{`{
  "id": "em_1o2jaosd8daks",
  "messageId": "0000014a-deb8-4e72-9e83-123456789012",
  "from": "sender@0.email",
  "to": ["user@inbound.exon.dev"],
  "recipient": "user@inbound.exon.dev",
  "subject": "Welcome to Inbound!",
  "receivedAt": "2025-05-28T12:00:00.000Z",
  "status": "received",
  "sesVerdict": {
    "spamVerdict": "PASS",
    "virusVerdict": "PASS",
    "spfVerdict": "PASS",
    "dkimVerdict": "PASS",
    "dmarcVerdict": "PASS"
  },
  "processingTimeMillis": 127,
  "metadata": {
    "userId": "usr_1o2jaosd8daks",
    "domainId": "dom_1o2jaosd8daks",
    "s3BucketName": "inbound-emails-prod",
    "s3ObjectKey": "emails/2024/01/0000014a-deb8-4e72.txt"
  }
}`}</pre>
                      </div>
                      <div className="mt-4 text-green-600 font-semibold">
                        ✓ 200 OK - Delivered successfully
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>


          {/* Comprehensive Features Section */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Everything You Need for Email Processing</h2>
            <p className="text-lg text-gray-600 mb-16 text-center max-w-3xl mx-auto">
              Complete email infrastructure with powerful features for developers, AI agents, and businesses. 
              From simple forwarding to complex automation workflows.
            </p>

            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-16">
              {/* Core Email Features */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                  <HiGlobeAlt className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">1 Free Domain</h3>
                <p className="text-gray-600 mb-4">
                  Connect one custom domain completely free. Verify ownership with simple DNS configuration and start receiving emails instantly.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>DNS verification & validation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Automatic MX record configuration</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>SPF, DKIM, DMARC support</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                  <HiMail className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Unlimited Email Aliases</h3>
                <p className="text-gray-600 mb-4">
                  Create unlimited individual aliases like hello@, support@, sales@ or set up a catch-all to receive emails sent to any address.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Individual email addresses</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Domain-wide catch-all support</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Instant activation & deactivation</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-red-300 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4">
                  <HiShieldCheck className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Granular Email Blocking</h3>
                <p className="text-gray-600 mb-4">
                  Advanced blocking controls let you stop spam from specific addresses, domains, or patterns while keeping your catch-all active.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Block specific email addresses</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Domain-level blocking rules</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Pattern-based spam filtering</span>
                  </li>
                </ul>
              </div>

              {/* Advanced Features */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-green-300 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                  <HiLightningBolt className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Multi-Type Endpoints</h3>
                <p className="text-gray-600 mb-4">
                  Flexible endpoint system supporting webhooks, email forwarding, and email groups for any automation workflow.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>HTTP webhooks with retries</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Email forwarding to individuals</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Email groups for team notifications</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                  <HiCode className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Developer Tools</h3>
                <p className="text-gray-600 mb-4">
                  Complete TypeScript SDK and REST API with full type safety, comprehensive documentation, and real-time testing tools.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>TypeScript SDK with full types</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>REST API for any language</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Interactive API documentation</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 hover:border-yellow-300 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center mb-4">
                  <HiDatabase className="w-6 h-6 text-yellow-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Analytics & Monitoring</h3>
                <p className="text-gray-600 mb-4">
                  Comprehensive analytics dashboard with delivery tracking, performance metrics, and real-time monitoring of all email processing.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Real-time delivery tracking</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Performance metrics & insights</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>Error logging & debugging</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* SDK and API Showcase */}
            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
              {/* SDK Card */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-8 border border-purple-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                    <HiCode className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">TypeScript SDK</h3>
                </div>
                <p className="text-gray-600 mb-6">
                  Install our npm package and start creating email addresses and webhooks with full type safety and auto-completion.
                </p>
                <div className="bg-gray-900 rounded-lg p-4 mb-6 font-mono text-sm">
                  <div className="text-green-400 mb-2">$ npm install exon-inbound</div>
                  <div className="text-gray-300">
                    <span className="text-blue-400">import</span> {`{ createInboundClient }`} <span className="text-blue-400">from</span> <span className="text-yellow-300">'exon-inbound'</span>
                  </div>
                  <div className="text-gray-300 mt-2">
                    <span className="text-blue-400">const</span> <span className="text-white">client</span> = <span className="text-yellow-300">createInboundClient</span>({`{ `}
                  </div>
                  <div className="text-gray-300 ml-4">
                    <span className="text-red-400">apiKey</span>: <span className="text-green-300">process.env.INBOUND_API_KEY</span>
                  </div>
                  <div className="text-gray-300">{`})`}</div>
                </div>
                <Button variant="secondary" asChild>
                  <a href="/docs" className="flex items-center gap-2">
                    View SDK Docs
                    <HiArrowRight className="w-3 h-3" />
                  </a>
                </Button>
              </div>

              {/* API Card */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-8 border border-blue-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                    <HiGlobeAlt className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">REST API</h3>
                </div>
                <p className="text-gray-600 mb-6">
                  Use our REST API directly from any language or platform. Complete with authentication, rate limiting, and comprehensive error handling.
                </p>
                <div className="bg-gray-900 rounded-lg p-4 mb-6 font-mono text-sm">
                  <div className="text-green-400 mb-2">POST /api/v1/domains</div>
                  <div className="text-gray-300">
                    {`{`}
                    <br />
                    &nbsp;&nbsp;<span className="text-yellow-300">"domain"</span>: <span className="text-green-300">"example.com"</span>,
                    <br />
                    &nbsp;&nbsp;<span className="text-yellow-300">"email"</span>: <span className="text-green-300">"hello@example.com"</span>
                    <br />
                    {`}`}
                  </div>
                </div>
                <Button variant="secondary" asChild>
                  <a href="/docs" className="flex items-center gap-2">
                    View API Docs
                    <HiArrowRight className="w-3 h-3" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {/* AI Agents Section */}
          <div className="mb-32">
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-12 border border-indigo-200">
              <div className="max-w-4xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
                  <HiSparkles className="w-4 h-4" />
                  Perfect for AI Agents & Automation
                </div>
                
                <h2 className="text-3xl font-bold text-gray-900 mb-6">Give Your AI Agents Email Superpowers</h2>
                <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
                  Connect AI agents directly to email addresses for customer support, lead processing, 
                  content analysis, and automated workflows. Real-time structured data delivery.
                </p>

                <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left mb-8">
                  <div className="bg-white p-6 rounded-xl border border-indigo-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <HiLightningBolt className="w-6 h-6 text-indigo-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Real-time Processing</h3>
                    </div>
                    <p className="text-gray-600 mb-4">
                      Emails delivered to your AI agent within seconds with structured, parsed content including 
                      attachments, headers, and metadata.
                    </p>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-center gap-2">
                        <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>Sub-2 second delivery latency</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>Structured JSON payload</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>Automatic retry & error handling</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-indigo-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <HiShieldCheck className="w-6 h-6 text-purple-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900">Enterprise Security</h3>
                    </div>
                    <p className="text-gray-600 mb-4">
                      Built-in spam filtering, virus scanning, and email authentication (SPF, DKIM, DMARC) 
                      ensure only legitimate emails reach your AI systems.
                    </p>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-center gap-2">
                        <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>99.9% spam detection accuracy</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>Virus & malware protection</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <HiCheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>HMAC webhook signatures</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="bg-gray-900 rounded-xl p-6 text-left mb-8">
                  <div className="text-sm text-gray-400 mb-2">Example: AI Customer Support Agent</div>
                  <div className="font-mono text-sm text-green-400">
                    <div className="text-blue-400">POST</div> <span className="text-gray-300">https://api.yourapp.com/ai/support-agent</span>
                    <div className="mt-2 text-gray-300">
                      {`{`}
                      <br />
                      &nbsp;&nbsp;<span className="text-yellow-300">"from"</span>: <span className="text-green-300">"customer@example.com"</span>,
                      <br />
                      &nbsp;&nbsp;<span className="text-yellow-300">"subject"</span>: <span className="text-green-300">"Need help with billing"</span>,
                      <br />
                      &nbsp;&nbsp;<span className="text-yellow-300">"textBody"</span>: <span className="text-green-300">"Hi, I have a question about..."</span>,
                      <br />
                      &nbsp;&nbsp;<span className="text-yellow-300">"sentiment"</span>: <span className="text-green-300">"neutral"</span>,
                      <br />
                      &nbsp;&nbsp;<span className="text-yellow-300">"priority"</span>: <span className="text-green-300">"medium"</span>
                      <br />
                      {`}`}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button variant="primary" asChild>
                    {session ? (
                      <a href="/add" className="flex items-center gap-2">
                        Start Building with AI
                        <HiArrowRight className="w-4 h-4" />
                      </a>
                    ) : (
                      <a href="/login" className="flex items-center gap-2">
                        Start Building with AI
                        <HiArrowRight className="w-4 h-4" />
                      </a>
                    )}
                  </Button>
                  <Button variant="secondary" asChild>
                    <a href="/docs" className="flex items-center gap-2">
                      View AI Integration Docs
                      <HiArrowRight className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Social Proof Section */}
          <div className="mb-32">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Trusted by Developers & AI Builders</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Join thousands of developers using Inbound for their email infrastructure needs
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold text-[#6C47FF] mb-2">{githubStars > 0 ? githubStars.toLocaleString() : '1000+'}+</div>
                <div className="text-gray-600">GitHub Stars</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-[#6C47FF] mb-2">99.9%</div>
                <div className="text-gray-600">Uptime SLA</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-[#6C47FF] mb-2">{'<2s'}</div>
                <div className="text-gray-600">Average Latency</div>
              </div>
            </div>

            <div className="mt-12 bg-gray-50 rounded-xl p-8">
              <div className="text-center mb-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Use Cases</h3>
                <p className="text-gray-600">See how teams are using Inbound for their email automation</p>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <HiSparkles className="w-6 h-6 text-blue-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">AI Customer Support</h4>
                  <p className="text-sm text-gray-600">Automated email responses and ticket routing</p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <HiDatabase className="w-6 h-6 text-green-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">Lead Processing</h4>
                  <p className="text-sm text-gray-600">Automatic lead qualification and CRM integration</p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <HiUserGroup className="w-6 h-6 text-purple-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">Team Notifications</h4>
                  <p className="text-sm text-gray-600">Smart routing to team channels and tools</p>
                </div>
                
                <div className="text-center">
                  <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <HiCog className="w-6 h-6 text-orange-600" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-2">Workflow Automation</h4>
                  <p className="text-sm text-gray-600">Email-triggered workflows and integrations</p>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">Simple Pricing</h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              Choose the plan that's right for your needs. Start with our free tier and upgrade as you grow.
            </p>
            <PricingTable />
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
