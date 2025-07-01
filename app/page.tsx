import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import InboundIcon from "@/components/InboundIcon"
import { PricingTable } from "@/components/autumn/pricing-table"
import { HiArrowRight, HiMail, HiGlobeAlt, HiLockClosed, HiCheckCircle, HiLightningBolt, HiArrowDown, HiX, HiStar, HiMailOpen, HiChip, HiCog, HiLightBulb, HiSparkles, HiShieldCheck, HiCode, HiCube, HiCollection, HiCalendar, HiUser } from "react-icons/hi"
import Image from "next/image"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import CustomInboundIcon from "@/components/icons/customInbound"
import { fetchZenBlogPosts, formatBlogDate, extractTextFromHtml } from "@/lib/zenblog"
import Link from "next/link"

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

  // Fetch GitHub stars and blog posts server-side
  const [githubStars, blogPosts] = await Promise.all([
    getGitHubStars(),
    fetchZenBlogPosts({ limit: 3 }) // Fetch latest 3 blog posts
  ])

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Header */}
      <header className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-100">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/inbound-logo-3.png" alt="Email" width={32} height={32} className="inline-block align-bottom flex-shrink-0" />
            <div className="flex flex-col items-start gap-0 min-w-0">
              <span className="text-xl sm:text-2xl font-bold text-black truncate">inbound</span>
              <span className="text-xs text-gray-500 -mt-2 hidden sm:block">by exon</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* GitHub Star Button - Hidden on small screens */}
            <Button variant="secondary" asChild className="hidden sm:flex">
              <a href="https://github.com/R44VC0RP/inbound" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                <span className="hidden md:inline">Star</span> {githubStars > 0 && `(${githubStars})`}
              </a>
            </Button>
            
            {/* Discord Button - Simplified on mobile */}
            <Button variant="secondary" asChild className="hidden sm:flex">
              <a href="https://discord.gg/JVdUrY9gJZ" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"/>
                </svg>
                Discord
              </a>
            </Button>
            
            {/* Blog Button */}
            <Button variant="secondary" asChild>
              <Link href="/blog">
                Blog
              </Link>
            </Button>
            
            {/* Conditionally show Sign In or Go to Dashboard based on auth state */}
            {session ? (
              <Button variant="primary" asChild className="text-sm px-3 py-2">
                <a href="/mail">
                  <span className="hidden sm:inline">Go to Mail</span>
                  <span className="sm:hidden">Mail</span>
                </a>
              </Button>
            ) : (
              <Button variant="primary" asChild className="text-sm px-3 py-2">
                <a href="/login">
                  <span className="hidden sm:inline">Sign In</span>
                  <span className="sm:hidden">Login</span>
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 sm:px-6 py-12 sm:py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Section */}
          <div className="mb-12 sm:mb-16">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-4 sm:mb-6 leading-tight">
              turn any
              <CustomInboundIcon
                className="inline-block ml-2 sm:ml-4 mr-1 sm:mr-2 align-bottom opacity-0 animate-[fadeInRotate_1s_ease-out_0.5s_forwards]"
                backgroundColor="#1C2894"
                Icon={HiMail}
                size={48}
              />
              <span className="text-[#1C2894]">email address</span>
              <br />
              into an
              <CustomInboundIcon
                className="inline-block ml-2 sm:ml-4 mr-1 sm:mr-2 align-bottom opacity-0 animate-[fadeInRotate_1s_ease-out_0.7s_forwards]"
                backgroundColor="#6C47FF"
                Icon={HiCode}
                size={48}
              />
              <span className="text-[#6C47FF]">endpoint</span>
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-4 max-w-3xl mx-auto leading-relaxed px-4">
              receive emails as structured JSON with full type safety. 
              set up catch-all domains, forward to teams, or block unwanted senders. 
              <span className="font-semibold">no more email parsing headaches.</span>
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 max-w-md mx-auto mt-4 px-4">
              <Input type="email" placeholder="support@yourapp.com" className="w-full sm:flex-1" />
              <Button variant="primary" asChild className="w-full sm:w-auto whitespace-nowrap">
                {session ? (
                  <a href="/add" className="flex items-center justify-center gap-2">
                    <span className="hidden sm:inline">Start Receiving</span>
                    <span className="sm:hidden">Start</span>
                    <HiArrowRight className="w-3 h-3" />
                  </a>
                ) : (
                  <a href="/login" className="flex items-center justify-center gap-2">
                    <span className="hidden sm:inline">Start Receiving</span>
                    <span className="sm:hidden">Start</span>
                    <HiArrowRight className="w-3 h-3" />
                  </a>
                )}
              </Button>
            </div>
          </div>

          {/* Core Features Overview */}
          <div className="mb-16 sm:mb-24">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
              {/* Feature 1: Catch-All Domains */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200 text-left">
                <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center mb-4">
                  <HiGlobeAlt className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Catch-All Domains</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Capture any email to your domain. Block unwanted addresses with one click
                </p>
                <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 overflow-x-auto">
                  <div>*@yourapp.com → webhook</div>
                  <div className="text-gray-400 mt-1">+ granular blocking</div>
                </div>
              </div>

              {/* Feature 2: Email to Webhook */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200 text-left">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
                  <HiLightningBolt className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Email → Webhook</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Every email becomes a typed JSON payload delivered to your endpoint instantly
                </p>
                <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 overflow-x-auto">
                  <div>POST /your-webhook</div>
                  <div className="text-gray-400 mt-1">{`{ email: ParsedEmailData }`}</div>
                </div>
              </div>

              {/* Feature 3: Smart Routing */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200 text-left">
                <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center mb-4">
                  <HiCollection className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Smart Routing</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Forward to individual emails or distribution groups with full headers
                </p>
                <div className="bg-gray-900 rounded-lg p-3 font-mono text-xs text-green-400 overflow-x-auto">
                  <div>support@ → team@yourapp.com</div>
                  <div className="text-gray-400 mt-1">+ attachments preserved</div>
                </div>
              </div>
            </div>
          </div>

          {/* Real Example Flow */}
          <div className="mb-16 sm:mb-32 text-left">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 sm:mb-12 text-center">see it in action</h2>

            <div className="max-w-4xl mx-auto">
              {/* Step 1: Email Sent */}
              <div className="relative">
                <div className="bg-[#1A1A1A] rounded-xl shadow-lg overflow-hidden">
                  <div className="px-3 sm:px-4 pt-3 pb-0">
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-[#313135] pb-3 gap-2">
                        <div className="flex items-center gap-2 justify-start min-w-0">
                          <span className="text-[#8C8C8C] text-sm flex-shrink-0">To:</span>
                          <span className="text-white text-sm ml-2 px-2 py-1 bg-[#2A2A2A] rounded-md gap-2 flex items-center min-w-0">
                            <span className="truncate">support@yourapp.com</span>
                          </span>
                        </div>
                        <button className="text-[#8C8C8C] hover:text-[#A8A8A8] text-sm self-start sm:self-center">
                          Cc Bcc
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center border-b border-[#313135] pb-3 gap-2">
                        <span className="text-[#8C8C8C] text-sm sm:w-20 flex-shrink-0">Subject:</span>
                        <input
                          type="text"
                          value="Help with API integration"
                          readOnly
                          className="flex-1 bg-transparent text-white placeholder:text-[#797979] focus:outline-none text-sm min-w-0"
                        />
                      </div>

                      <div className="min-h-[120px] sm:min-h-[150px] pb-3">
                        <p className="text-white text-sm">
                          Hi there,
                          <br />
                          <br />
                          I'm having trouble setting up the webhook endpoint. Could you help?
                          <br />
                          <br />
                          Thanks!
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 pt-2 border-t border-[#313135] gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button className="flex items-center gap-2 px-2 py-1 bg-white text-black rounded-md text-sm font-medium hover:bg-gray-100 transition-colors">
                          Send
                          <div className="hidden sm:flex h-5 items-center justify-center gap-1 rounded-sm px-1 bg-black/10">
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white text-sm hidden sm:inline">sent via</span>
                        <svg width="12" height="12" viewBox="0 0 191 191" fill="none" xmlns="http://www.w3.org/2000/svg" className="hidden sm:block">
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

              {/* Arrow */}
              <div className="flex items-center justify-center py-6 sm:py-8">
                <div className="relative">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-gray-300 -translate-y-1/2"></div>
                  <div className="relative bg-white px-4">
                    <HiArrowDown className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Step 2: Smart Routing */}
              <div className="relative">
                <div className="bg-gradient-to-br from-orange-50 to-yellow-50 rounded-xl shadow-lg overflow-hidden border border-orange-200">
                  <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-orange-200 bg-orange-100">
                    <h3 className="text-orange-900 font-semibold flex items-center gap-2 text-sm sm:text-base">
                      <HiCog className="w-4 h-4 text-orange-600" />
                      Smart Routing Engine
                    </h3>
                  </div>
                  <div className="p-4 sm:p-6">
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-orange-200">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <span className="text-gray-700">Analyzing recipient: <code className="bg-gray-100 px-1 rounded">support@yourapp.com</code></span>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-orange-200">
                        <HiCheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-gray-700">Found endpoint configuration: <strong>Webhook</strong></span>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-orange-200">
                        <HiCheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-gray-700">Spam/virus checks: <strong>Passed</strong></span>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-orange-200">
                        <HiLightningBolt className="w-4 h-4 text-purple-500" />
                        <span className="text-gray-700">Routing to: <code className="bg-purple-100 px-1 rounded text-purple-700">https://api.yourapp.com/webhook</code></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center py-6 sm:py-8">
                <div className="relative">
                  <div className="absolute inset-x-0 top-1/2 h-px bg-gray-300 -translate-y-1/2"></div>
                  <div className="relative bg-white px-4">
                    <HiArrowDown className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Step 3: Webhook Payload */}
              <div className="relative">
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl shadow-lg overflow-hidden border border-purple-200">
                  <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-purple-200 bg-purple-100">
                    <h3 className="text-purple-900 font-semibold flex items-center gap-2 text-sm sm:text-base">
                      <HiCode className="w-4 h-4 text-purple-600" />
                      Your Webhook Receives
                    </h3>
                  </div>
                  <div className="p-4 sm:p-6">
                    <div className="font-mono text-xs sm:text-sm bg-white rounded-lg p-3 sm:p-4 border border-purple-200 overflow-x-auto">
                      <div className="text-purple-600 mb-2 break-all">POST https://api.yourapp.com/webhook</div>
                      <div className="mt-3 text-gray-700">
                        <pre className="whitespace-pre-wrap text-xs sm:text-sm overflow-x-auto">{`{
  "event": "email.received",
  "email": {
    "id": "em_1o2jaosd8daks",
    "messageId": "0000014a-deb8-4e72-9e83-123456789012",
    "from": "customer@gmail.com",
    "to": ["support@yourapp.com"],
    "subject": "Help with API integration",
    "receivedAt": "2025-01-15T12:00:00.000Z",
    "parsedData": {
      "textBody": "Hi there,\\n\\nI'm having trouble...",
      "htmlBody": "<p>Hi there,</p><p>I'm having trouble...</p>",
      "from": {
        "addresses": [{"address": "customer@gmail.com", "name": "John Doe"}]
      },
      "attachments": [],
      "headers": { "message-id": "<abc123@gmail.com>" }
    }
  }
}`}</pre>
                      </div>
                      <div className="mt-4 text-green-600 font-semibold text-xs sm:text-sm">
                        ✓ Fully typed with TypeScript SDK
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* TypeScript SDK Section */}
          <div className="mb-16 sm:mb-32">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 text-center">typesafe from day one</h2>
            <p className="text-base sm:text-lg text-gray-600 mb-8 sm:mb-12 text-center max-w-2xl mx-auto px-4">
              our typescript sdk gives you full type safety for webhook payloads, api responses, and email data structures.
            </p>

            <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto">
              {/* SDK Installation */}
              <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-xl p-6 sm:p-8 border border-gray-200 text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiCube className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">Install & Configure</h3>
                </div>
                <div className="bg-gray-900 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 font-mono text-xs sm:text-sm text-left overflow-x-auto">
                  <div className="text-green-400 mb-2">$ npm install exon-inbound</div>
                  <div className="text-gray-300 mt-3">
                    <span className="text-blue-400">import</span> {`{ createInboundClient }`} <span className="text-blue-400">from</span> <span className="text-yellow-300">'exon-inbound'</span>
                    <br />
                    <br />
                    <span className="text-blue-400">const</span> inbound = <span className="text-yellow-300">createInboundClient</span>({`{`}
                    <br />
                    &nbsp;&nbsp;apiKey: process.env.<span className="text-green-300">INBOUND_API_KEY</span>
                    <br />
                    {`}`})
                  </div>
                </div>
              </div>

              {/* Webhook Handler Example */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 sm:p-8 border border-blue-200 text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiCode className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">Handle Webhooks</h3>
                </div>
                <div className="bg-gray-900 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 font-mono text-xs sm:text-sm text-left overflow-x-auto">
                  <div className="text-gray-300">
                    <span className="text-blue-400">import</span> {`{ InboundEmailPayload }`} <span className="text-blue-400">from</span> <span className="text-yellow-300">'exon-inbound'</span>
                    <br />
                    <br />
                    app.<span className="text-yellow-300">post</span>(<span className="text-green-300">'/webhook'</span>, (req, res) {`=>`} {`{`}
                    <br />
                    &nbsp;&nbsp;<span className="text-blue-400">const</span> email: <span className="text-cyan-300">InboundEmailPayload</span> = req.body
                    <br />
                    <br />
                    &nbsp;&nbsp;<span className="text-gray-500">// Full type safety!</span>
                    <br />
                    &nbsp;&nbsp;console.<span className="text-yellow-300">log</span>(email.parsedData.textBody)
                    <br />
                    &nbsp;&nbsp;console.<span className="text-yellow-300">log</span>(email.parsedData.attachments)
                    <br />
                    <br />
                    &nbsp;&nbsp;res.<span className="text-yellow-300">status</span>(<span className="text-orange-400">200</span>).<span className="text-yellow-300">send</span>(<span className="text-green-300">'OK'</span>)
                    <br />
                    {`}`})
                  </div>
                </div>
              </div>

              {/* Management Example */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 sm:p-8 border border-green-200 text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiCog className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900">Manage Everything</h3>
                </div>
                <div className="bg-gray-900 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 font-mono text-xs sm:text-sm text-left overflow-x-auto">
                  <div className="text-gray-300">
                    <span className="text-gray-500">// Add domains</span>
                    <br />
                    <span className="text-blue-400">await</span> inbound.<span className="text-yellow-300">addDomain</span>(<span className="text-green-300">'yourapp.com'</span>)
                    <br />
                    <br />
                    <span className="text-gray-500">// Create email addresses</span>
                    <br />
                    <span className="text-blue-400">await</span> inbound.<span className="text-yellow-300">createEmail</span>({`{`}
                    <br />
                    &nbsp;&nbsp;email: <span className="text-green-300">'support@yourapp.com'</span>,
                    <br />
                    &nbsp;&nbsp;webhook: webhookId
                    <br />
                    {`}`})
                    <br />
                    <br />
                    <span className="text-gray-500">// Enable catch-all</span>
                    <br />
                    <span className="text-blue-400">await</span> inbound.<span className="text-yellow-300">enableCatchAll</span>(domainId, webhookId)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mb-16 sm:mb-24">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center">perfect for</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              <div className="text-center">
                                 <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                   <HiLightBulb className="w-6 h-6 text-blue-600" />
                 </div>
                <h4 className="font-semibold text-gray-900 mb-2">AI Agents</h4>
                <p className="text-sm text-gray-600">Connect AI agents directly to email addresses for automated responses</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <HiMail className="w-6 h-6 text-purple-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Support Systems</h4>
                <p className="text-sm text-gray-600">Route support emails to your ticketing system with full context</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <HiShieldCheck className="w-6 h-6 text-green-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Email Proxies</h4>
                <p className="text-sm text-gray-600">Forward emails to teams while maintaining privacy and control</p>
              </div>
            </div>
          </div>

          {/* Blog Section */}
          {blogPosts.data.length > 0 && (
            <div className="mb-16 sm:mb-24">
              <div className="text-center mb-8 sm:mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">Latest from our blog</h2>
                <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto px-4">
                  Stay up to date with the latest insights, tutorials, and product updates from the inbound team.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto mb-8">
                {blogPosts.data.map((post) => (
                  <article key={post.slug} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden text-left">
                    <div className="p-6">
                      {/* Category */}
                      {post.category && (
                        <div className="mb-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[#1C2894]/10 text-[#1C2894]">
                            {post.category.name}
                          </span>
                        </div>
                      )}
                      
                      {/* Title */}
                      <h3 className="text-lg font-bold text-gray-900 mb-3 leading-tight">
                        <Link href={`/blog/${post.slug}`} className="hover:text-[#1C2894] transition-colors">
                          {post.title}
                        </Link>
                      </h3>
                      
                      {/* Excerpt */}
                      <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                        {post.excerpt || extractTextFromHtml(post.html_content, 120)}
                      </p>
                      
                      {/* Meta Info */}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-4">
                        <div className="flex items-center gap-1">
                          <HiCalendar className="w-3 h-3" />
                          <span>{formatBlogDate(post.published_at)}</span>
                        </div>
                        
                        {post.authors && post.authors.length > 0 && (
                          <div className="flex items-center gap-1">
                            <HiUser className="w-3 h-3" />
                            <span>{post.authors[0].name}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Read More Link */}
                      <Link 
                        href={`/blog/${post.slug}`}
                        className="inline-flex items-center gap-2 text-sm font-medium text-[#1C2894] hover:text-[#1C2894]/80 transition-colors"
                      >
                        Read more
                        <HiArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
              
              <div className="text-center">
                <Button variant="secondary" asChild>
                  <Link href="/blog">
                    View all posts
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Pricing */}
          <div className="">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 text-center">Simple Pricing</h2>
            <p className="text-base sm:text-lg text-gray-600 mb-8 sm:mb-12 text-center max-w-2xl mx-auto px-4">
              Start free, scale as you grow. No hidden fees, no email parsing headaches.
            </p>
            <PricingTable />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <img src="/inbound-logo-3.png" alt="Inbound Logo" className="w-6 h-6" />
            <span className="text-lg font-bold text-gray-900">inbound</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm text-gray-500">
            <a href="https://twitter.com/intent/follow?screen_name=inbounddotnew" className="hover:text-gray-700 transition-colors flex items-center gap-1">
              <span className="hidden sm:inline">Contact us on</span>
              <span className="sm:hidden">Twitter</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 1200 1227"><path fill="#000" d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z" /></svg>
            </a>
            <a href="https://discord.gg/JVdUrY9gJZ" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors flex items-center gap-1">Discord
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"/></svg>
            </a>
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
