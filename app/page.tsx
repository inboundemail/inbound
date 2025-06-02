"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import InboundIcon from "@/components/InboundIcon"
import { PricingTable } from "@/components/autumn/pricing-table"
import { FaArrowRight, FaEnvelope, FaGlobe, FaLock, FaCheckCircle, FaBolt, FaArrowDown, FaTimes, FaStar } from "react-icons/fa"
import { useState } from "react"
import Image from "next/image"
import { Sparkle, Sparkles } from "lucide-react"
import { useSession } from "@/lib/auth-client"

export default function HomePage() {
  const [email, setEmail] = useState("")
  const [domain, setDomain] = useState("")
  const { data: session, isPending } = useSession()

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setEmail(value)

    // Extract domain from email
    if (value.includes("@")) {
      const extractedDomain = value.split("@")[1]
      setDomain(extractedDomain || "")
    } else {
      setDomain("")
    }
  }

  const handleGetStarted = () => {
    if (email && email.includes("@")) {
      // Redirect to the login page
      window.location.href = `/login`
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="px-6 py-6 border-b border-gray-100 ">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-2">
            <img src="/inbound-logo-3.png" alt="Email" width={32} height={32} className="inline-block align-bottom" />
            <span className="text-2xl font-bold text-black">inbound</span>
          </div>
          {/* Conditionally show Sign In or Go to Dashboard based on auth state */}
          {isPending ? (
            <Button variant="primary" asChild>
              <a href="/docs" className="text-white hover:text-gray-900">
                Docs
              </a>
          </Button>
          ) : session ? (
            <Button variant="primary" asChild>
              <a href="/dashboard" className="text-white hover:text-gray-900">
                Go to Dashboard
              </a>
            </Button>
          ) : (
            <Button variant="primary" asChild>
              <a href="/login" className="text-white hover:text-gray-900">
                Sign In
              </a>
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Section */}
          <div className="mb-16">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              the easiest way to turn
              <br />

              <img 
                src="/mail-icon.png" 
                alt="Email" 
                width={48} 
                height={48} 
                className="inline-block ml-4 mr-2 align-bottom opacity-0 animate-[fadeInRotate_1s_ease-out_0.5s_forwards]" 
              />
              <span className="text-[#6C47FF]">emails</span> into

              <img 
                src="/domain-icon.png" 
                alt="Email" 
                width={48} 
                height={48} 
                className="inline-block ml-4 mr-2 align-bottom opacity-0 animate-[fadeInRotate_1s_ease-out_1s_forwards]" 
              />
              <span className="text-[#1C2894]">webhooks</span>
            </h1>
            <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed">
              set up email receiving for your domain in minutes.
              get webhooks when emails arrive, with automatic spam filtering and secure processing.
            </p>

            <Button variant="primary" asChild className="text-white hover:text-gray-900">
              <a href="/login" className="text-white hover:text-gray-900">
                Get Started (its free)
                <FaArrowRight className="ml-2 w-3 h-3" />
              </a>
            </Button>
          </div>

          {/* Interactive Demo Section */}
          <div className="mb-32 text-left">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">See it in action</h2>

            <div className="max-w-4xl mx-auto">
              {/* Email Draft */}
              <div className="relative">
                <div className="bg-[#1A1A1A] rounded-xl shadow-lg overflow-hidden">
                  <div className="px-3 pt-3 pb-0">

                    <div className="space-y-3">
                      <div className="flex justify-between items-center border-b border-[#313135] pb-3">
                        <div className="flex items-center gap-2 justify-start">
                          <span className="text-[#8C8C8C] text-sm ">To:</span>
                          <span className="text-white text-sm ml-2 px-2 py-1 bg-[#2A2A2A] rounded-md gap-2 flex items-center">user@inbound.exon.dev <FaTimes className="w-4 h-4 text-[#8C8C8C] inline-block ml-2" /></span>
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
                          <Sparkles className="w-4 h-4" />
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
                    <FaArrowDown className="w-6 h-6 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Email in Logs */}
              <div className="relative">
                <div className="bg-gray-900 rounded-xl shadow-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-800">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                      <FaEnvelope className="w-4 h-4 text-green-400" />
                      Incoming Email Logs
                    </h3>
                  </div>
                  <div className="p-6 font-mono text-sm">
                    <div className="flex items-start gap-3 text-gray-300">
                      <span className="text-gray-500">{new Date().toLocaleTimeString()}</span>
                      <FaCheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
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
                    <FaArrowDown className="w-6 h-6 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Webhook Trigger */}
              <div className="relative">
                <div className="bg-purple-50 rounded-xl shadow-lg overflow-hidden border border-purple-200">
                  <div className="px-6 py-4 border-b border-purple-200 bg-purple-100">
                    <h3 className="text-purple-900 font-semibold flex items-center gap-2">
                      <FaBolt className="w-4 h-4 text-purple-600" />
                      Webhook Triggered
                    </h3>
                  </div>
                  <div className="p-6">
                    <div className="font-mono text-sm bg-white rounded-lg p-4 border border-purple-200">
                      <div className="text-purple-600">POST https://api.yourapp.com/webhooks/email</div>
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


          {/* Docs and Developer Support */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Built for Developers</h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              Programmatically manage your email infrastructure with our TypeScript SDK and REST API.
            </p>
            
            <div className="space-y-8 max-w-4xl mx-auto">
              {/* SDK Card */}
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-8 border border-purple-200 text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L2 7v10c0 5.55 3.84 9.739 9 11 5.16-1.261 9-5.45 9-11V7l-10-5z"/>
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">TypeScript SDK</h3>
                </div>
                <p className="text-gray-600 mb-6">
                  Install our npm package and start creating email addresses and webhooks with full type safety.
                </p>
                <div className="bg-gray-900 rounded-lg p-4 mb-6 font-mono text-sm text-left">
                  <div className="text-green-400 mb-2">$ npm install exon-inbound</div>
                  <div className="text-gray-300">
                    <span className="text-blue-400">import</span> {`{ createInboundClient }`} <span className="text-blue-400">from</span> <span className="text-yellow-300">'exon-inbound'</span>
                  </div>
                </div>
                <Button variant="secondary" asChild className="w-full">
                  <a href="/docs" className="flex items-center justify-center gap-2">
                    View SDK Docs
                    <FaArrowRight className="w-3 h-3" />
                  </a>
                </Button>
              </div>

              {/* API Card */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-8 border border-blue-200 text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">REST API</h3>
                </div>
                <p className="text-gray-600 mb-6">
                  Use our REST API directly from any language or platform to integrate email receiving into your workflow.
                </p>
                <div className="bg-gray-900 rounded-lg p-4 mb-6 font-mono text-sm text-left">
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
                <Button variant="secondary" asChild className="w-full">
                  <a href="/docs" className="flex items-center justify-center gap-2">
                    View API Docs
                    <FaArrowRight className="w-3 h-3" />
                  </a>
                </Button>
              </div>
            </div>

            {/* Features List */}
            <div className="mt-12 grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <FaCheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Domain Management</h4>
                <p className="text-sm text-gray-600">List, verify, and manage your email domains programmatically</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <FaEnvelope className="w-6 h-6 text-purple-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Email Addresses</h4>
                <p className="text-sm text-gray-600">Create and delete email addresses on your verified domains</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <FaBolt className="w-6 h-6 text-blue-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Webhook Setup</h4>
                <p className="text-sm text-gray-600">Configure webhook endpoints to receive email notifications</p>
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
