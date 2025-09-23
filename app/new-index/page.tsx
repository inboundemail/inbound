"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useSession } from "@/lib/auth/auth-client"
import InboundIcon from "@/components/icons/inbound"
import PaperPlane2 from "@/components/icons/paper-plane-2"
import Settings3 from "@/components/icons/settings-3"
import InboxArrowDown from "@/components/icons/inbox-arrow-down"
import Check2 from "@/components/icons/check-2"
import Copy2 from "@/components/icons/copy-2"
import ArrowBoldRight from "@/components/icons/arrow-bold-right"
import CirclePlay from "@/components/icons/circle-play"

export default function NewHomePage() {
  const { data: session } = useSession()
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})
  const [emailInput, setEmailInput] = useState("example@ryan.com")
  const [isConnecting, setIsConnecting] = useState(false)
  const [theme, setTheme] = useState<"light" | "dark">("dark")

  // Initialize theme
  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme")
      const initialTheme = saved === "light" ? "light" : "dark"
      setTheme(initialTheme)
    } catch {}
  }, [])

  const toggleTheme = () => {
    try {
      const next = theme === "light" ? "dark" : "light"
      setTheme(next)
      localStorage.setItem("theme", next)
      const d = document.documentElement
      if (next === "light") d.classList.remove("dark")
      else d.classList.add("dark")
    } catch {}
  }

  const copyToClipboard = async (code: string, key: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedStates(prev => ({ ...prev, [key]: true }))
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [key]: false }))
      }, 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleConnect = () => {
    setIsConnecting(true)
    setTimeout(() => {
      setIsConnecting(false)
    }, 1500)
  }

  const codeExamples = {
    send: `export async function POST(req: Request) {
  const { email } = await req.json()
  
  // Email parsed & ready to use
  console.log(email.subject, email.html)
  
  return Response.json({ success: true })
}`,
    receive: `[SEND EMAILS]`,
    reply: `[RECEIVE EMAILS]`
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-sidebar/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3">
            <InboundIcon width={20} height={20} />
            <span className="text-2xl font-outfit font-semibold text-foreground -ml-2">
              inbound
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#examples" className="text-muted-foreground hover:text-foreground transition-colors">
              Examples
            </a>
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors">
              Docs
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            {session?.user ? (
              <Button variant="primary" asChild>
                <Link href="/logs">Log in</Link>
              </Button>
            ) : (
              <Button variant="primary" asChild>
                <Link href="/login">Get started</Link>
              </Button>
            )}
            <Button
              variant="secondary"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
                <g fill="currentColor">
                  <path d="M9 16.25C13.0041 16.25 16.25 13.0041 16.25 9C16.25 4.99594 13.0041 1.75 9 1.75C4.99594 1.75 1.75 4.99594 1.75 9C1.75 13.0041 4.99594 16.25 9 16.25Z" fill="currentColor" fillOpacity="0.3" />
                  <path d="M9 6V12C10.657 12 12 10.657 12 9C12 7.343 10.657 6 9 6Z" fill="currentColor" />
                  <path d="M9 12C7.343 12 6 10.657 6 9C6 7.343 7.343 6 9 6V1.75C4.996 1.75 1.75 4.996 1.75 9C1.75 13.004 4.996 16.25 9 16.25V12Z" fill="currentColor" />
                  <path d="M9 16.25C13.0041 16.25 16.25 13.0041 16.25 9C16.25 4.99594 13.0041 1.75 9 1.75C4.99594 1.75 1.75 4.99594 1.75 9C1.75 13.0041 4.99594 16.25 9 16.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </g>
              </svg>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-32">
          <div className="text-center space-y-8">
            <h1 className="text-4xl sm:text-6xl font-outfit font-semibold text-foreground tracking-tight">
              Email platform
              <br />
              for builders
            </h1>
            
            {/* Interactive Email Demo */}
            <div className="max-w-md mx-auto bg-card border border-border rounded-lg p-4 shadow-lg">
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Enter email"
                />
                <span className="text-muted-foreground">@</span>
                <input
                  type="text"
                  defaultValue="ryan.com"
                  className="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleConnect}
                  disabled={isConnecting}
                >
                  {isConnecting ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button size="lg" variant="primary" asChild>
                <Link href="/login">
                  Start free
                  <ArrowBoldRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/docs">View documentation</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Animated Email Visualization */}
        <div className="absolute top-1/2 right-10 transform -translate-y-1/2 opacity-20 pointer-events-none hidden lg:block">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse">
              <PaperPlane2 width={100} height={100} className="text-primary" />
            </div>
            <div className="absolute inset-0 animate-ping">
              <PaperPlane2 width={100} height={100} className="text-primary/50" />
            </div>
          </div>
        </div>
      </section>

      {/* Code Examples Section */}
      <section id="examples" className="py-20 bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-outfit font-semibold text-foreground mb-4">
              Simple, powerful API
            </h2>
            <p className="text-muted-foreground">
              Everything you need to handle email in your application
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Send Emails */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PaperPlane2 width={16} height={16} className="text-primary" />
                  <span className="font-medium text-sm">[SEND EMAILS]</span>
                </div>
                <button
                  onClick={() => copyToClipboard(codeExamples.send, "send")}
                  className="p-1 hover:bg-muted rounded transition-colors"
                >
                  {copiedStates["send"] ? (
                    <Check2 width={14} height={14} className="text-green-500" />
                  ) : (
                    <Copy2 width={14} height={14} className="text-muted-foreground" />
                  )}
                </button>
              </div>
              <div className="p-4">
                <pre className="text-xs text-muted-foreground overflow-x-auto">
                  <code>{`export async function POST(req: Request) {
  const { email } = await req.json()
  
  // Email parsed & ready to use
  console.log(email.subject, email.html)
  
  return Response.json({ success: true })
}`}</code>
                </pre>
              </div>
            </div>

            {/* Receive Emails */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <InboxArrowDown width={16} height={16} className="text-primary" />
                  <span className="font-medium text-sm">[RECEIVE EMAILS]</span>
                </div>
                <button
                  onClick={() => copyToClipboard(codeExamples.receive, "receive")}
                  className="p-1 hover:bg-muted rounded transition-colors"
                >
                  {copiedStates["receive"] ? (
                    <Check2 width={14} height={14} className="text-green-500" />
                  ) : (
                    <Copy2 width={14} height={14} className="text-muted-foreground" />
                  )}
                </button>
              </div>
              <div className="p-4">
                <pre className="text-xs text-muted-foreground overflow-x-auto">
                  <code>{`export async function POST(request: NextRequest) {
  try {
    const payload: InboundWebhookPayload = await request.json()
    
    const { email } = payload
    
    const { text } = await generateText({
      model: openai("o3-mini"),
      prompt: \`
      You are a custom support agent for
      a company called "Inbound"
      The email is: \${email.subject}
      The email body is: \${email.html}
      \`
    })

    await inbound.reply(email, {
      from: 'support@yourdomain.com',
      text: text,
      tags: [{ name: 'type', value: 'auto-reply' }]
    })
    
    return NextResponse.json({ success: true })
  } 
}`}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-outfit font-semibold text-foreground mb-4">
              Built for modern applications
            </h2>
            <p className="text-muted-foreground">
              Everything you need to integrate email into your product
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <PaperPlane2 width={24} height={24} />,
                title: "Send & Receive",
                description: "Full email capabilities with a simple API. No SMTP configuration needed."
              },
              {
                icon: <Settings3 width={24} height={24} />,
                title: "Webhooks",
                description: "Real-time notifications when emails are received. Fully typed payloads."
              },
              {
                icon: <InboxArrowDown width={24} height={24} />,
                title: "Email Parsing",
                description: "Automatic parsing of headers, attachments, and content. Get clean JSON."
              },
              {
                icon: <Check2 width={24} height={24} />,
                title: "TypeScript First",
                description: "Full TypeScript support with auto-complete and type safety."
              },
              {
                icon: <CirclePlay width={24} height={24} />,
                title: "Auto-Reply",
                description: "Build AI agents that can respond to emails automatically."
              },
              {
                icon: <Copy2 width={24} height={24} />,
                title: "Thread Management",
                description: "Automatic conversation threading and reply tracking."
              }
            ].map((feature, index) => (
              <div
                key={index}
                className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors"
              >
                <div className="text-primary mb-4">{feature.icon}</div>
                <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trusted By Section */}
      <section className="py-20 bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-8 font-medium">
            Trusted by builders at
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 text-muted-foreground">
            <span className="text-lg font-medium flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 58 57" fill="none">
                <path fillRule="evenodd" clipRule="evenodd" d="M0 9.82759C0 4.39996 4.47705 0 9.99976 0H47.9989C53.5216 0 57.9986 4.39996 57.9986 9.82759V41.5893C57.9986 47.2045 50.7684 49.6414 47.2618 45.2082L36.2991 31.3488V48.1552C36.2991 53.04 32.2698 57 27.2993 57H9.99976C4.47705 57 0 52.6 0 47.1724V9.82759ZM9.99976 7.86207C8.89522 7.86207 7.99981 8.74206 7.99981 9.82759V47.1724C7.99981 48.2579 8.89522 49.1379 9.99976 49.1379H27.5993C28.1516 49.1379 28.2993 48.6979 28.2993 48.1552V25.6178C28.2993 20.0027 35.5295 17.5656 39.0361 21.9989L49.9988 35.8583V9.82759C49.9988 8.74206 50.1034 7.86207 48.9988 7.86207H9.99976Z" fill="currentColor" />
                <path d="M48.0003 0C53.523 0 58 4.39996 58 9.82759V41.5893C58 47.2045 50.7699 49.6414 47.2633 45.2082L36.3006 31.3488V48.1552C36.3006 53.04 32.2712 57 27.3008 57C27.8531 57 28.3008 56.56 28.3008 56.0172V25.6178C28.3008 20.0027 35.5309 17.5656 39.0375 21.9989L50.0002 35.8583V1.96552C50.0002 0.879992 49.1048 0 48.0003 0Z" fill="currentColor" />
              </svg>
              neon
            </span>
            <span className="text-lg font-medium flex items-center gap-2">
              <svg height="24" width="24" viewBox="0 0 185 291">
                <g fill="none">
                  <path d="M142.177 23.3423H173.437C179.612 23.3423 184.617 28.3479 184.617 34.5227V258.318C184.617 264.493 179.612 269.498 173.437 269.498H142.177V23.3423Z" fill="currentColor" />
                  <path d="M0 57.5604C0 52.8443 2.9699 48.6392 7.41455 47.0622L125.19 5.27404C132.441 2.70142 140.054 8.07871 140.054 15.7722V275.171C140.054 282.801 132.557 288.172 125.332 285.718L7.55682 245.715C3.03886 244.18 0 239.939 0 235.167V57.5604Z" fill="currentColor" />
                </g>
              </svg>
              churchspace
            </span>
            <span className="text-lg font-medium">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              clerk
            </span>
          </div>
        </div>
      </section>

      {/* Open Source Section */}
      <section className="py-12 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="flex items-center justify-center gap-4 text-muted-foreground">
            <span className="text-sm font-medium">▲ OPEN SOURCE SOFTWARE PROGRAM</span>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-outfit font-semibold text-foreground mb-4">
            Ready to build with email?
          </h2>
          <p className="text-muted-foreground mb-8">
            Join thousands of developers using Inbound to handle email in their applications
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="primary" asChild>
              <Link href="/login">
                Get started free
                <ArrowBoldRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/docs">Read documentation</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <InboundIcon width={24} height={24} />
              <span className="text-lg font-semibold text-foreground">inbound</span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/docs" className="hover:text-foreground transition-colors">
                Docs
              </Link>
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Inbound. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}