"use client"

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import Copy2 from "@/components/icons/copy-2"
import Check2 from "@/components/icons/check-2"
import PaperPlane2 from "@/components/icons/paper-plane-2"
import Settings3 from "@/components/icons/settings-3"
import InboxArrowDown from "@/components/icons/inbox-arrow-down"
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import Link from 'next/link'

export default function NewHomepage() {
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({})
  const [demoEmail, setDemoEmail] = useState('example@yourdomain.com')

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedStates(prev => ({ ...prev, [key]: true }))
      toast.success('Copied to clipboard!')
      
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [key]: false }))
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error('Failed to copy')
    }
  }

  const installCommand = 'bun add @inboundemail/sdk'
  const sendEmailCode = `import { Inbound } from '@inboundemail/sdk'

const inbound = new Inbound(process.env.INBOUND_API_KEY!)

// Send email
await inbound.emails.send({
  from: 'hello@yourdomain.com',
  to: '${demoEmail}',
  subject: 'Welcome to Inbound',
  html: '<p>Thanks for signing up!</p>'
})`

  const receiveEmailCode = `export async function POST(request: Request) {
  const { email } = await request.json()
  
  // Email parsed & ready to use
  console.log('From:', email.from)
  console.log('Subject:', email.subject)
  console.log('Body:', email.html)
  
  return Response.json({ success: true })
}`

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <PaperPlane2 width={16} height={16} className="text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold text-foreground">inbound</span>
            </div>
            
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors">
                Docs
              </Link>
              <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link href="/examples" className="text-muted-foreground hover:text-foreground transition-colors">
                Examples
              </Link>
            </nav>
            
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Sign In</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/logs">Get Started</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-16">
        <div className="text-center mb-16">
          <div className="mb-6 inline-flex items-center gap-2 bg-card border border-primary/20 rounded-full px-4 py-2">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
            <span className="text-sm text-muted-foreground">Now in Public Beta</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-foreground mb-6 tracking-tight">
            <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
              <PaperPlane2 width={32} height={32} className="text-primary shrink-0" />
              <span>Email platform</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span>for</span>
              <Settings3 width={32} height={32} className="text-primary shrink-0" />
              <span className="text-primary">builders</span>
            </div>
          </h1>
          
          <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8 leading-relaxed">
            Stop wrestling with SMTP configs and email parsing. 
            <br className="hidden sm:block" />
            Send, receive, and reply to emails with a simple SDK.
          </p>
          
          {/* Install Command */}
          <div className="inline-flex items-center bg-card border border-border rounded-lg overflow-hidden mb-8">
            <div className="px-4 py-3 bg-muted/30 border-r border-border">
              <span className="text-xs text-muted-foreground font-mono">$</span>
            </div>
            <code className="px-4 py-3 text-sm font-mono text-foreground">{installCommand}</code>
            <button
              onClick={() => copyToClipboard(installCommand, 'install')}
              className="px-3 py-3 hover:bg-accent transition-colors duration-200"
              title="Copy to clipboard"
            >
              {copiedStates.install ? (
                <Check2 width={16} height={16} className="text-green-500" />
              ) : (
                <Copy2 width={16} height={16} className="text-muted-foreground" />
              )}
            </button>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" asChild>
              <Link href="/onboarding-demo">Try Live Demo</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/docs">View Documentation</Link>
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-20">
          <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-shadow duration-200">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <PaperPlane2 width={24} height={24} className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Send Emails</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Simple API to send emails. No SMTP configuration, no environment variable hell.
            </p>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-shadow duration-200">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <InboxArrowDown width={24} height={24} className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Receive Webhooks</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Get clean JSON payloads when emails arrive. No more parsing raw email headers.
            </p>
          </div>
          
          <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-shadow duration-200">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <Settings3 width={24} height={24} className="text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Auto-Reply</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Build AI agents that respond to emails with proper conversation threading.
            </p>
          </div>
        </div>
      </section>

      <div className="border-t border-dashed border-border"></div>

      {/* Interactive Demo Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-semibold text-foreground mb-4">
            See it in action
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Three lines of code. That's all it takes to send and receive emails.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          {/* Send Email Example */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-semibold text-foreground">1. Send an email</h3>
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                <span>Simple</span>
                <Check2 className="w-3 h-3" />
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mb-6">
              No SMTP configuration needed. Just provide your API key and send.
            </p>

            <div className="bg-gray-900 dark:bg-black rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-800 dark:bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
                <span className="text-xs text-gray-400 font-mono">send-email.js</span>
                <button
                  onClick={() => copyToClipboard(sendEmailCode, 'send')}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  {copiedStates.send ? (
                    <Check2 width={14} height={14} className="text-green-400" />
                  ) : (
                    <Copy2 width={14} height={14} />
                  )}
                </button>
              </div>
              <div className="p-4 font-mono text-sm text-white overflow-x-auto">
                <div className="space-y-2">
                  <div>
                    <span className="text-blue-400">import</span> {"{ Inbound }"}{" "}
                    <span className="text-blue-400">from</span>{" "}
                    <span className="text-green-400">'@inboundemail/sdk'</span>
                  </div>
                  <div className="mt-4"></div>
                  <div>
                    <span className="text-blue-400">const</span> inbound = <span className="text-blue-400">new</span>{" "}
                    <span className="text-yellow-400">Inbound</span>(process.env.<span className="text-purple-400">INBOUND_API_KEY</span>!)
                  </div>
                  <div className="mt-4"></div>
                  <div className="text-gray-400">// Send email</div>
                  <div>
                    <span className="text-blue-400">await</span> inbound.emails.<span className="text-yellow-400">send</span>({"{"})
                  </div>
                  <div className="ml-4">
                    from: <span className="text-green-400">'hello@yourdomain.com'</span>,
                  </div>
                  <div className="ml-4 flex items-center gap-1">
                    to: 
                    <input
                      type="email"
                      value={demoEmail}
                      onChange={(e) => setDemoEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="inline-block w-48 h-5 bg-gray-900 border border-gray-600 text-green-400 rounded text-sm px-2 mx-2"
                    />
                    <span className="text-white">,</span>
                  </div>
                  <div className="ml-4">
                    subject: <span className="text-green-400">'Welcome to Inbound'</span>,
                  </div>
                  <div className="ml-4">
                    html: <span className="text-green-400">'&lt;p&gt;Thanks for signing up!&lt;/p&gt;'</span>
                  </div>
                  <div>{"}"}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Receive Email Example */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-semibold text-foreground">2. Receive webhooks</h3>
              <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 px-3 py-1 rounded-full text-xs font-medium border border-blue-200 dark:border-blue-800">
                <span>Automatic</span>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground mb-6">
              Get clean, parsed email data in your webhook endpoint. No manual parsing required.
            </p>

            <div className="bg-gray-900 dark:bg-black rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-800 dark:bg-gray-900 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
                <span className="text-xs text-gray-400 font-mono">webhook.js</span>
                <button
                  onClick={() => copyToClipboard(receiveEmailCode, 'receive')}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  {copiedStates.receive ? (
                    <Check2 width={14} height={14} className="text-green-400" />
                  ) : (
                    <Copy2 width={14} height={14} />
                  )}
                </button>
              </div>
              <div className="p-4 font-mono text-sm text-white overflow-x-auto">
                <div className="space-y-2">
                  <div>
                    <span className="text-blue-400">export</span>{" "}
                    <span className="text-blue-400">async</span>{" "}
                    <span className="text-blue-400">function</span>{" "}
                    <span className="text-yellow-400">POST</span>(request: <span className="text-purple-400">Request</span>) {"{"}
                  </div>
                  <div className="ml-4">
                    <span className="text-blue-400">const</span> {"{ email }"} = <span className="text-blue-400">await</span> request.<span className="text-yellow-400">json</span>()
                  </div>
                  <div className="mt-2 ml-4"></div>
                  <div className="ml-4 text-gray-400">// Email parsed & ready to use</div>
                  <div className="ml-4">
                    console.<span className="text-yellow-400">log</span>(<span className="text-green-400">'From:'</span>, email.from)
                  </div>
                  <div className="ml-4">
                    console.<span className="text-yellow-400">log</span>(<span className="text-green-400">'Subject:'</span>, email.subject)
                  </div>
                  <div className="ml-4">
                    console.<span className="text-yellow-400">log</span>(<span className="text-green-400">'Body:'</span>, email.html)
                  </div>
                  <div className="mt-2 ml-4"></div>
                  <div className="ml-4">
                    <span className="text-blue-400">return</span> Response.<span className="text-yellow-400">json</span>({"{ success: "}<span className="text-blue-400">true</span>{" }"})
                  </div>
                  <div>{"}"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-12">
          <Button size="lg" asChild>
            <Link href="/onboarding-demo">Try the Interactive Demo</Link>
          </Button>
        </div>
      </section>

      <div className="border-t border-dashed border-border"></div>

      {/* Why Choose Inbound */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-semibold text-foreground mb-4">
            Why developers choose Inbound
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Stop spending weeks on email infrastructure. Focus on building features that matter.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-all duration-200">
            <div className="text-2xl mb-4">🔥</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No SMTP Hell</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Skip the 47 environment variables and TLS certificate nightmares. Just works.
            </p>
            <div className="space-y-1 text-xs">
              <div className="text-red-400">❌ Before: 2 weeks debugging SMTP</div>
              <div className="text-green-400">✅ After: 2 minutes sending emails</div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-all duration-200">
            <div className="text-2xl mb-4">⚡</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Webhook Parsing That Works</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Get clean JSON instead of raw email headers and MIME parsing disasters.
            </p>
            <div className="space-y-1 text-xs">
              <div className="text-red-400">❌ Before: 500 lines of parsing code</div>
              <div className="text-green-400">✅ After: 3 lines with perfect data</div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-all duration-200">
            <div className="text-2xl mb-4">💬</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Reply Threading Magic</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Automatic conversation threading. Your AI agents can actually have conversations.
            </p>
            <div className="space-y-1 text-xs">
              <div className="text-red-400">❌ Before: Manual message-ID tracking</div>
              <div className="text-green-400">✅ After: Automatic conversation flow</div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-all duration-200">
            <div className="text-2xl mb-4">🌐</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Domain Setup Simplified</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              DNS records that actually make sense. Verification that works on the first try.
            </p>
            <div className="space-y-1 text-xs">
              <div className="text-red-400">❌ Before: DNS debugging for days</div>
              <div className="text-green-400">✅ After: One-click domain setup</div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-all duration-200">
            <div className="text-2xl mb-4">⚡</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">TypeScript Native</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              IntelliSense that knows what you want before you type it. No more any types.
            </p>
            <div className="space-y-1 text-xs">
              <div className="text-red-400">❌ Before: Fighting with types</div>
              <div className="text-green-400">✅ After: Types that help you</div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-all duration-200">
            <div className="text-2xl mb-4">🚀</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Production Ready</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Built for scale. Handle 10k emails/day or 10M. Same simple API.
            </p>
            <div className="space-y-1 text-xs">
              <div className="text-red-400">❌ Before: Scaling email is hard</div>
              <div className="text-green-400">✅ After: Scales automatically</div>
            </div>
          </div>
        </div>
      </section>

      <div className="border-t border-dashed border-border"></div>

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold text-foreground mb-4">
          Ready to escape email hell?
        </h2>
        <p className="text-lg text-muted-foreground mb-12 max-w-2xl mx-auto">
          Stop wasting time on email infrastructure. Start building features that matter.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
          <Button size="lg" asChild>
            <Link href="/onboarding-demo">Start Free Trial</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/docs">View Documentation</Link>
          </Button>
        </div>
        
        <p className="text-sm text-muted-foreground">
          No credit card required • 1,000 emails/month free • Cancel anytime
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <PaperPlane2 width={16} height={16} className="text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold text-foreground">inbound</span>
            </div>
            
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <Link href="/docs" className="hover:text-foreground transition-colors">
                Documentation
              </Link>
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link href="/changelog" className="hover:text-foreground transition-colors">
                Changelog
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <a href="mailto:support@inbound.new" className="hover:text-foreground transition-colors">
                Support
              </a>
            </div>
          </div>
          
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Inbound. The email platform for builders.
          </div>
        </div>
      </footer>

      <Toaster />
    </div>
  )
}