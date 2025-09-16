"use client"

import { useState, useEffect } from 'react'
import { Highlighter } from "@/components/magicui/highlighter";
import Link from 'next/link'
import { VideoText } from "@/components/magicui/video-text";
import Image from 'next/image'
import { CustomInboundIcon } from "@/components/icons/customInbound"
import { Button } from "@/components/ui/button"
import { CodeBlock } from '@/components/ui/code-block'
import { BackgroundBeams } from "@/components/ui/background-beams"
import { Boxes } from "@/components/ui/background-boxes"
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import Copy2 from '@/components/icons/copy-2';
import Check2 from '@/components/icons/check-2';
import { ConnectingArrow } from '@/components/ui/connecting-arrow';
import InboxArrowDown from '@/components/icons/inbox-arrow-down';
import Settings3 from '@/components/icons/settings-3';
import PaperPlane2 from '@/components/icons/paper-plane-2';
import { SiteHeader } from "@/components/site-header";
import InboundIcon from '@/components/icons/inbound';

// Monaspace font-face for inline code in examples

export default function PSLandingPage() {
  const [animatedText, setAnimatedText] = useState('')
  const [copiedStates, setCopiedStates] = useState<Record<number, boolean>>({})

  const copyToClipboard = async (code: string, storyIndex: number) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedStates(prev => ({ ...prev, [storyIndex]: true }))

      // Reset the checkmark after 2 seconds
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [storyIndex]: false }))
      }, 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const problemStories = [
    {
      title: "the problem: email hell",
      type: "node.js",
      description: "you've been there. spending days configuring SMTP, parsing raw email headers, dealing with bounces...",
      code: `// You can't even get webhooks from existing providers 😢
const nodemailer = require('nodemailer')
const transporter = nodemailer.createTransporter({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: process.env.EMAIL, pass: process.env.PASSWORD },
  tls: { rejectUnauthorized: false }
})

// No webhook support - you're on your own
app.post('/webhook', (req, res) => {
  const rawEmail = req.body
  // Now what? Parse headers? Handle attachments? 
  // Good luck with that...
})`
    },
    {
      title: "the solution: inbound ✨ magic",
      description: "what if sending and receiving emails was as simple as making an API call?",
      code: `// With Inbound ✨
import { Inbound } from '@inboundemail/sdk'

const inbound = new Inbound(process.env.INBOUND_API_KEY!)

// Send email (Resend-compatible)
await inbound.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<p>Thanks for signing up!</p>'
})

// That's it. No SMTP. No config. Just works.`
    },
    {
      title: "the superpower: auto-reply",
      description: "build AI agents that actually respond to emails. no more manual parsing or threading nightmares.",
      code: `const inbound = new Inbound(process.env.INBOUND_API_KEY!)

export async function POST(request: NextRequest) {
  try {
    const payload: InboundWebhookPayload = await request.json()
    
    const { email } = payload
    
    const { text } = await generateText({
      model: openai("o3-mini"),
      prompt: """
      You are a custom support agent for
      a company called "Inbound"
      The email is: \${email.subject}
      The email body is: \${email.html}
      """
    })

    await inbound.reply(email, {
      from: 'support@yourdomain.com',
      text: text,
      tags: [{ name: 'type', value: 'auto-reply' }]
    })
    
    return NextResponse.json({ success: true })
  } 
}`
    }
  ]

  const testimonials = [
    {
      company: "Cursor AI",
      person: "Sarah Chen, CTO",
      quote: "We were spending 2 weeks per feature just dealing with email infrastructure. Inbound eliminated that completely - our AI agents now handle customer emails in production.",
      logo: "C"
    },
    {
      company: "Anthropic",
      person: "Marcus Rodriguez, Lead Engineer",
      quote: "Before Inbound, we had 3 engineers just maintaining our email parsing pipeline. Now it's 3 lines of code and it actually works better.",
      logo: "A"
    },
    {
      company: "OpenAI",
      person: "Jessica Park, Product Lead",
      quote: "Our support bot went from 'maybe works sometimes' to 'handles 10k emails/day flawlessly' after switching to Inbound. Game changer.",
      logo: "O"
    },
    {
      company: "Vercel",
      person: "Alex Thompson, Developer",
      quote: "I was dreading the email integration sprint. Finished it in 20 minutes instead of 2 weeks. My manager thought I was joking.",
      logo: "V"
    }
  ]

  const painPoints = [
    {
      title: "No More SMTP Hell",
      description: "Skip the 47 environment variables and TLS certificate nightmares. Just works.",
      icon: "🔥",
      before: "2 weeks debugging SMTP",
      after: "2 minutes sending emails"
    },
    {
      title: "Webhook Parsing That Works",
      description: "Get clean JSON instead of raw email headers and MIME parsing disasters.",
      icon: "⚡",
      before: "500 lines of parsing code",
      after: "3 lines with perfect data"
    },
    {
      title: "Reply Threading Magic",
      description: "Automatic conversation threading. Your AI agents can actually have conversations.",
      icon: "💬",
      before: "Manual message-ID tracking",
      after: "Automatic conversation flow"
    },
    {
      title: "Domain Setup Simplified",
      description: "DNS records that actually make sense. Verification that works on the first try.",
      icon: "🌐",
      before: "DNS debugging for days",
      after: "One-click domain setup"
    },
    {
      title: "TypeScript Native",
      description: "IntelliSense that knows what you want before you type it. No more any types.",
      icon: "⚡",
      before: "Fighting with types",
      after: "Types that help you"
    },
    {
      title: "Production Ready",
      description: "Built for scale. Handle 10k emails/day or 10M. Same simple API.",
      icon: "🚀",
      before: "Scaling email is hard",
      after: "Scales automatically"
    }
  ]

  return (
    <div className="min-h-screen relative">
      {/* CSS Variables for theme */}
      <style jsx global>{`
        @font-face {
          font-family: 'Monaspace Neon';
          src: url('/MonaspaceNeon-Medium.woff') format('woff');
          font-weight: 500;
          font-style: normal;
          font-display: swap;
        }
      `}
      </style>

      <SiteHeader />

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20 relative z-10 overflow-hidden">
        <div className="text-center mb-16 relative z-20 flex flex-col items-center min-h-[60vh] sm:min-h-[75vh] justify-center">
          <div className="mb-6 sm:mb-8 bg-card rounded-lg overflow-hidden relative border border-primary" style={{
            boxShadow: '0 0 0 1px var(--purple-primary), 0 0 20px rgba(108, 71, 255, 0.4), 0 0 40px rgba(108, 71, 255, 0.2)'
          }}>
            <img src="/vercel-oss.svg" alt="Vercel OSS" className="h-6 sm:h-8 p-2 sm:p-3 dark:invert-0 invert" />
          </div>
          
          <h1 className="text-3xl sm:text-4xl md:text-5xl mb-4 sm:mb-6 leading-tight text-foreground">
            <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
              <PaperPlane2 width={24} height={24} className="sm:w-[30px] sm:h-[30px] shrink-0" />
              <span>email platform for</span>
              <Settings3 width={24} height={24} className="sm:w-[30px] sm:h-[30px] shrink-0" />
              <Highlighter action="underline" color="var(--purple-primary)">builders</Highlighter>
            </div>
            <TextGenerateEffect
              words="focus on your product, not configs"
              className="text-xl sm:text-2xl md:text-3xl font-bold leading-tight text-[var(--purple-primary)] mt-1 sm:-mt-2"
              duration={0.5}
            />
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto mb-4 leading-relaxed px-4">
            stop messing with multiple providers and ancient sdks
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>
            inbound is the easiest way to send, receive, and reply to emails in your app
          </p>
          <div className="relative bg-card border border-border rounded-md overflow-hidden mb-6 sm:mb-8 mx-auto" style={{ width: 'fit-content' }}>
            <div className="flex items-center pr-8 sm:pr-10">
              <pre className="px-2 py-1.5 sm:px-3 sm:py-2">
                <code className="text-foreground font-mono text-[10px] sm:text-xs whitespace-nowrap">bun add @inboundemail/sdk</code>
              </pre>
              <button
                onClick={() => copyToClipboard('bun add @inboundemail/sdk', -1)}
                className="absolute top-1/2 right-1.5 sm:right-2 -translate-y-1/2 p-1 sm:p-1.5 rounded hover:bg-accent transition-colors duration-200 flex items-center justify-center"
                title={copiedStates[-1] ? "Copied!" : "Copy to clipboard"}
                aria-label="Copy to clipboard"
              >
                <div className={`transition-all duration-300 ease-in-out ${copiedStates[-1] ? 'scale-110' : 'scale-100'}`}>
                  {copiedStates[-1] ? (
                    <Check2 width={12} height={12} className="sm:w-3.5 sm:h-3.5 text-green-500" />
                  ) : (
                    <Copy2 width={12} height={12} className="sm:w-3.5 sm:h-3.5 text-muted-foreground hover:text-foreground" />
                  )}
                </div>
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center w-full max-w-sm sm:max-w-none">
            <Button
              size="lg"
              variant="primary"
              className="w-full sm:w-auto"
              asChild
            >
              <Link href="/logs">start building</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
              asChild
            >
              <Link href="https://docs.inbound.new">view docs</Link>
            </Button>
          </div>

          {/* Trusted by section */}
          <div className="mt-16 pt-8 border-t border-[var(--border-secondary)]">
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-6 font-medium text-center">
              trusted by builders at:
            </p>
            <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-4 text-[var(--text-muted)]">
              <span className="text-lg font-medium flex items-center gap-2 mr-1">
                <svg width="18" height="18" viewBox="0 0 58 57" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M0 9.82759C0 4.39996 4.47705 0 9.99976 0H47.9989C53.5216 0 57.9986 4.39996 57.9986 9.82759V41.5893C57.9986 47.2045 50.7684 49.6414 47.2618 45.2082L36.2991 31.3488V48.1552C36.2991 53.04 32.2698 57 27.2993 57H9.99976C4.47705 57 0 52.6 0 47.1724V9.82759ZM9.99976 7.86207C8.89522 7.86207 7.99981 8.74206 7.99981 9.82759V47.1724C7.99981 48.2579 8.89522 49.1379 9.99976 49.1379H27.5993C28.1516 49.1379 28.2993 48.6979 28.2993 48.1552V25.6178C28.2993 20.0027 35.5295 17.5656 39.0361 21.9989L49.9988 35.8583V9.82759C49.9988 8.74206 50.1034 7.86207 48.9988 7.86207H9.99976Z" fill="var(--text-muted)" />
                  <path d="M48.0003 0C53.523 0 58 4.39996 58 9.82759V41.5893C58 47.2045 50.7699 49.6414 47.2633 45.2082L36.3006 31.3488V48.1552C36.3006 53.04 32.2712 57 27.3008 57C27.8531 57 28.3008 56.56 28.3008 56.0172V25.6178C28.3008 20.0027 35.5309 17.5656 39.0375 21.9989L50.0002 35.8583V1.96552C50.0002 0.879992 49.1048 0 48.0003 0Z" fill="var(--text-muted)" />
                </svg>

                neon
              </span>
              <span className="text-lg font-medium flex items-center gap-2">
                <svg height="24" width="24" viewBox="0 0 185 291" xmlns="http://www.w3.org/2000/svg"><g fill="none"><path d="M142.177 23.3423H173.437C179.612 23.3423 184.617 28.3479 184.617 34.5227V258.318C184.617 264.493 179.612 269.498 173.437 269.498H142.177V23.3423Z" fill="currentColor"></path><path d="M0 57.5604C0 52.8443 2.9699 48.6392 7.41455 47.0622L125.19 5.27404C132.441 2.70142 140.054 8.07871 140.054 15.7722V275.171C140.054 282.801 132.557 288.172 125.332 285.718L7.55682 245.715C3.03886 244.18 0 239.939 0 235.167V57.5604Z" fill="currentColor"></path></g></svg>
                churchspace
              </span>
            </div>
          </div>
        </div>

        {/* Problem-Solution Story */}
        <div className="space-y-8 relative z-20 ">
          {problemStories.map((story, i) => (
            <>
              <div key={i} className="grid md:grid-cols-4 gap-8 items-center">
                <div className={`space-y-4 md:col-span-2 ${i % 2 === 1 ? 'md:order-2' : ''}`}>
                  <h3 className="text-2xl text-[var(--text-primary)]">{story.title}</h3>
                  <p className="text-lg text-[var(--text-secondary)] leading-relaxed">{story.description}</p>
                </div>
                <div className={`md:col-span-2 ${i % 2 === 1 ? 'md:order-1' : ''}`}>
                  <div className="bg-card border border-border rounded-lg overflow-hidden">
                    <div className="py-1.5 px-4 bg-muted/30 border-b border-border font-mono text-xs flex items-center gap-2 font-bold text-muted-foreground justify-between">
                      <div className='flex items-center gap-2'>
                        <Image src="/nodejs.png" alt="node.js" width={16} height={16} />
                        <span>node.js</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(story.code, i)}
                        className="p-1 rounded hover:bg-accent transition-colors duration-200 flex items-center justify-center"
                        title={copiedStates[i] ? "Copied!" : "Copy code"}
                      >
                        <div className={`transition-all duration-300 ease-in-out ${copiedStates[i] ? 'scale-110' : 'scale-100'}`}>
                          {copiedStates[i] ? (
                            <Check2 width={12} height={12} className="text-green-500" />
                          ) : (
                            <Copy2 width={12} height={12} className="text-muted-foreground hover:text-foreground" />
                          )}
                        </div>
                      </button>
                    </div>
                    <CodeBlock
                      code={story.code}
                      language="javascript"
                      syntaxHighlighting
                      copy={false}
                      variant="ghost"
                      size="lg"
                      className="rounded-none border-0 m-0"
                    />
                  </div>
                </div>
              </div>

              {/* Connecting Arrow between stories */}
              {i < problemStories.length - 1 && (
                <div className={`hidden md:flex ${i % 2 === 0 ? 'justify-end pr-[15%]' : 'justify-start pl-[15%]'}`}>
                  <ConnectingArrow
                    color="#FFFFFF"
                    width={100}
                    height={100}
                    className={`opacity-50 hover:opacity-70 transition-opacity duration-300 ${i % 2 === 0 ? '' : 'scale-x-[-1]'}`}
                  />
                </div>
              )}
            </>
          ))}
        </div>

        {/* Background Beams for Hero */}
        <div className="absolute inset-0 h-[100vh]">
          <BackgroundBeams className='' />
        </div>
      </section>

      {/* Pain Points & Solutions */}
      {/* <section id="features" className="max-w-6xl mx-auto px-6 py-20 relative z-10">
                <h2 className="text-3xl font-bold text-center mb-4">stop suffering with email</h2>
                <p className="text-[var(--text-secondary)] text-center mb-16 text-base">
                    We've all been there. Here's how Inbound fixes the pain.
                </p>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {painPoints.map((point, i) => (
                        <div
                            key={i}
                            className="bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-lg p-6 hover:bg-[var(--bg-card-hover)] hover:border-[var(--purple-primary)]/50 transition-all duration-200"
                        >
                            <div className="text-2xl mb-4">{point.icon}</div>
                            <h3 className="text-lg font-semibold mb-2 text-[var(--purple-primary)]">{point.title}</h3>
                            <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-4">{point.description}</p>
                            <div className="space-y-2">
                                <div className="text-xs text-red-400">❌ Before: {point.before}</div>
                                <div className="text-xs text-green-400">✅ After: {point.after}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section> */}

      {/* Reality Check Section */}
      <section id="examples" className="bg-card py-20 relative z-10 overflow-hidden">
        {/* Background Boxes */}
        <div className="absolute inset-0 z-0">
          <Boxes />
        </div>
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <h2 className="text-3xl text-center mb-12 text-foreground">let's be honest about email</h2>

          <div className="grid md:grid-cols-4 gap-8 items-center">
            {/* What You're Probably Doing Now */}
            <div className="space-y-4 md:col-span-2">
              <h3 className="text-2xl text-foreground">What You're Probably Doing Now</h3>
              <div className="bg-muted/40 border border-border rounded-lg p-6 space-y-2 leading-relaxed text-foreground">
                <p>• Googling "how to send email in Node.js" for the 17th time</p>
                <p>• Wrestling with nodemailer configuration that breaks in production</p>
                <p>• Manually parsing email headers like it's 1995</p>
                <p>• Building your own webhook endpoint and hoping it works</p>
                <p>• Spending more time on email than your actual product</p>
                <p>• <Highlighter action="underline" color="var(--purple-primary)">inbound</Highlighter> to the rescue</p>
              </div>
            </div>

            {/* What You Could Be Doing */}
            <div className="md:col-span-2">
              <div className="space-y-4 mb-4">
                <h3 className="text-2xl text-foreground">What You Could Be Doing</h3>
              </div>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="py-1.5 px-4 bg-muted/30 border-b border-border font-mono text-xs flex items-center gap-2 font-bold text-muted-foreground justify-between">
                  <div className='flex items-center gap-2'>
                    <Image src="/nodejs.png" alt="node.js" width={16} height={16} />
                    <span>node.js</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`// Install once
bun add @inboundemail/sdk

// Send emails forever  
await inbound.emails.send(emailData)

// That's it. Seriously.`, 999)}
                    className="p-1 rounded hover:bg-accent transition-colors duration-200 flex items-center justify-center"
                    title={copiedStates[999] ? "Copied!" : "Copy code"}
                  >
                    <div className={`transition-all duration-300 ease-in-out ${copiedStates[999] ? 'scale-110' : 'scale-100'}`}>
                      {copiedStates[999] ? (
                        <Check2 width={12} height={12} className="text-green-500" />
                      ) : (
                        <Copy2 width={12} height={12} className="text-muted-foreground hover:text-foreground" />
                      )}
                    </div>
                  </button>
                </div>
                <CodeBlock
                  code={`// Install once\nbun add @inboundemail/sdk\n\n// Send emails forever ♾️\nawait inbound.emails.send(emailData)\n\n// That's it. Seriously.`}
                  language="javascript"
                  syntaxHighlighting
                  copy={false}
                  variant="ghost"
                  size="lg"
                  className="rounded-none border-0 m-0"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      {/* <section id="testimonials" className="max-w-6xl mx-auto px-6 py-20 relative z-10">
                <h2 className="text-3xl font-bold text-center mb-4">developers who escaped email hell</h2>
                <p className="text-[var(--text-secondary)] text-center mb-16 text-base">
                    Real stories from teams who got their time back
                </p>
                <div className="grid md:grid-cols-2 gap-8">
                    {testimonials.map((testimonial, i) => (
                        <div
                            key={i}
                            className="bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-lg p-6 hover:bg-[var(--bg-card-hover)] hover:border-[var(--purple-primary)]/50 transition-all duration-200"
                        >
                            <div className="flex items-center gap-4 mb-4">
                                <CustomInboundIcon
                                    size={48}
                                    backgroundColor="var(--purple-primary)"
                                    text={testimonial.logo}
                                    iconColor="white"
                                />
                                <div>
                                    <div className="font-semibold text-[var(--purple-primary)]">{testimonial.company}</div>
                                    <div className="text-sm text-[var(--text-muted)]">{testimonial.person}</div>
                                </div>
                            </div>
                            <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">
                                "{testimonial.quote}"
                            </p>
                        </div>
                    ))}
                </div>
            </section> */}

      {/* SDK Highlight */}
      <section className="bg-card py-20 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-8 text-foreground">
              <span className="font-mono p-2 bg-muted rounded-lg">@inboundemail/sdk</span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              The simplest way to handle email in your applications.
              Send, receive, and reply with full TypeScript support.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Send Email Example */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                <Highlighter action="underline" color="var(--purple-primary)">
                  Send
                </Highlighter>
              </h3>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="py-1.5 px-4 bg-muted/30 border-b border-border font-mono text-xs flex items-center gap-2 font-bold text-muted-foreground justify-between">
                  <div className='flex items-center gap-2'>
                    <Image src="/nodejs.png" alt="node.js" width={16} height={16} />
                    <span>send.js</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`await inbound.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Thanks for signing up!</h1>'
})`, 1001)}
                    className="p-1 rounded hover:bg-accent transition-colors duration-200 flex items-center justify-center"
                    title={copiedStates[1001] ? "Copied!" : "Copy code"}
                  >
                    <div className={`transition-all duration-300 ease-in-out ${copiedStates[1001] ? 'scale-110' : 'scale-100'}`}>
                      {copiedStates[1001] ? (
                        <Check2 width={12} height={12} className="text-green-500" />
                      ) : (
                        <Copy2 width={12} height={12} className="text-muted-foreground hover:text-foreground" />
                      )}
                    </div>
                  </button>
                </div>
                <CodeBlock
                  code={`await inbound.emails.send({\n  from: 'hello@yourdomain.com',\n  to: 'user@example.com',\n  subject: 'Welcome!',\n  html: '<h1>Thanks for signing up!</h1>'\n})`}
                  language="javascript"
                  copy={false}
                  variant="ghost"
                  size="lg"
                  className="rounded-none border-0 m-0"
                />
              </div>
            </div>

            {/* Receive Example */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                <Highlighter action="underline" color="var(--purple-primary)">
                  Receive
                </Highlighter>
              </h3>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="py-1.5 px-4 bg-muted/30 border-b border-border font-mono text-xs flex items-center gap-2 font-bold text-muted-foreground justify-between">
                  <div className='flex items-center gap-2'>
                    <Image src="/nodejs.png" alt="node.js" width={16} height={16} />
                    <span>receive.js</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`export async function POST(req: Request) {
  const { email } = await req.json()
  
  // Email parsed & ready to use
  console.log(email.subject, email.html)
  
  return Response.json({ success: true })
}`, 1002)}
                    className="p-1 rounded hover:bg-accent transition-colors duration-200 flex items-center justify-center"
                    title={copiedStates[1002] ? "Copied!" : "Copy code"}
                  >
                    <div className={`transition-all duration-300 ease-in-out ${copiedStates[1002] ? 'scale-110' : 'scale-100'}`}>
                      {copiedStates[1002] ? (
                        <Check2 width={12} height={12} className="text-green-500" />
                      ) : (
                        <Copy2 width={12} height={12} className="text-muted-foreground hover:text-foreground" />
                      )}
                    </div>
                  </button>
                </div>
                <CodeBlock
                  code={`export async function POST(req: Request) {\n  const { email } = await req.json()\n  \n  // Email parsed & ready to use\n  console.log(email.subject, email.html)\n  \n  return Response.json({ success: true })\n}`}
                  language="javascript"
                  syntaxHighlighting
                  copy={false}
                  variant="ghost"
                  size="lg"
                  className="rounded-none border-0 m-0"
                />
              </div>
            </div>

            {/* Reply Example */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                <Highlighter action="underline" color="var(--purple-primary)">
                  Reply
                </Highlighter>
              </h3>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="py-1.5 px-4 bg-muted/30 border-b border-border font-mono text-xs flex items-center gap-2 font-bold text-muted-foreground justify-between">
                  <div className='flex items-center gap-2'>
                    <Image src="/nodejs.png" alt="node.js" width={16} height={16} />
                    <span>reply.js</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`await inbound.reply(email, {
  from: 'support@yourdomain.com',
  text: 'Thanks for your message!',
  tags: [{ name: 'type', value: 'auto-reply' }]
})`, 1003)}
                    className="p-1 rounded hover:bg-accent transition-colors duration-200 flex items-center justify-center"
                    title={copiedStates[1003] ? "Copied!" : "Copy code"}
                  >
                    <div className={`transition-all duration-300 ease-in-out ${copiedStates[1003] ? 'scale-110' : 'scale-100'}`}>
                      {copiedStates[1003] ? (
                        <Check2 width={12} height={12} className="text-green-500" />
                      ) : (
                        <Copy2 width={12} height={12} className="text-muted-foreground hover:text-foreground" />
                      )}
                    </div>
                  </button>
                </div>
                <CodeBlock
                  code={`await inbound.reply(email, {\n  from: 'support@yourdomain.com',\n  text: 'Thanks for your message!',\n  tags: [{ name: 'type', value: 'auto-reply' }]\n})`}
                  language="javascript"
                  syntaxHighlighting
                  copy={false}
                  variant="ghost"
                  size="lg"
                  className="rounded-none border-0 m-0"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center relative z-10">
        <h2 className="text-3xl font-bold mb-4 text-foreground">ready to escape email hell?</h2>
        <p className="text-lg text-muted-foreground mb-12">
          Stop wasting time on email infrastructure. Start building features that matter.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            variant="primary"
            asChild
          >
            <Link href="/login">start free</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
          >
            <Link href="https://docs.inbound.new">read docs</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-sidebar py-12 relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <InboundIcon width={32} height={32} />
              <span className="text-xl font-semibold text-foreground">inbound</span>
            </div>
            <div className="flex gap-8 text-sm text-muted-foreground">
              <Link href="https://docs.inbound.new" className="hover:text-foreground transition-colors">docs</Link>
              <Link href="https://inbound.new/privacy" className="hover:text-foreground transition-colors">privacy</Link>
              <Link href="https://inbound.new/terms" className="hover:text-foreground transition-colors">terms</Link>
              <a href="mailto:support@inbound.new" className="hover:text-foreground transition-colors">support</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} inbound (by exon). The all-in-one email toolkit for developers.
          </div>
        </div>
      </footer>
    </div>
  )
}
