"use client"

import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { SiteHeader } from "@/components/site-header"
import { CodeBlock } from '@/components/ui/code-block'
import InboundIcon from '@/components/icons/inbound'

export default function FeaturesPage() {
  const coreFeatures = [
    {
      title: "Send Transactional Emails",
      description: "Send welcome emails, notifications, and alerts with our reliable email sending API. Compatible with popular email services like Resend.",
      icon: "📧",
      features: [
        "High deliverability rates",
        "Template support with variables",
        "Bulk email sending",
        "Email tracking & analytics",
        "Bounce and complaint handling",
        "SMTP & API sending options"
      ],
      codeExample: `import { Inbound } from '@inboundemail/sdk'

const inbound = new Inbound(process.env.INBOUND_API_KEY!)

await inbound.emails.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome to our platform!',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  tags: [{ name: 'type', value: 'welcome' }]
})`
    },
    {
      title: "Receive Inbound Emails",
      description: "Process incoming emails with webhooks. Get structured data including HTML, text, attachments, and headers - no more parsing raw email.",
      icon: "📥",
      features: [
        "Webhook email parsing",
        "Custom domain setup",
        "Attachment handling up to 25MB",
        "Email forwarding rules",
        "Spam filtering",
        "Real-time delivery"
      ],
      codeExample: `export async function POST(request: Request) {
  const payload: InboundWebhookPayload = await request.json()
  
  const { email } = payload
  
  // Structured email data - no parsing needed!
  console.log({
    from: email.from,
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: email.attachments
  })
  
  return Response.json({ success: true })
}`
    },
    {
      title: "AI Email Agents",
      description: "Build intelligent email responders and customer service bots. Auto-reply with context-aware AI responses and maintain conversation threads.",
      icon: "🤖",
      features: [
        "Automatic conversation threading",
        "AI-powered smart replies",
        "Email classification & routing",
        "Custom response logic",
        "Integration with OpenAI, Anthropic",
        "Sentiment analysis"
      ],
      codeExample: `import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

export async function POST(request: Request) {
  const { email } = await request.json()
  
  const { text } = await generateText({
    model: openai("gpt-4o"),
    prompt: \`You are a helpful support agent.
    Email: \${email.subject}
    Body: \${email.text}\`
  })

  await inbound.reply(email, {
    from: 'support@yourdomain.com',
    html: \`<p>\${text}</p>\`,
    tags: [{ name: 'type', value: 'ai-reply' }]
  })
}`
    }
  ]

  const developerFeatures = [
    {
      title: "TypeScript SDK",
      description: "Full type safety with IntelliSense support. Our SDK provides complete TypeScript definitions for all operations.",
      icon: "⚡"
    },
    {
      title: "Webhook Security",
      description: "Verify webhook signatures to ensure requests are coming from Inbound. Built-in security best practices.",
      icon: "🔒"
    },
    {
      title: "Real-time Logs",
      description: "Monitor all email activity in real-time. Debug issues with detailed logs and error messages.",
      icon: "📊"
    },
    {
      title: "Custom Domains",
      description: "Use your own domain for sending and receiving emails. Professional email addresses for your brand.",
      icon: "🌐"
    },
    {
      title: "Rate Limiting",
      description: "Built-in rate limiting and queue management. Handle high volume email processing reliably.",
      icon: "⚙️"
    },
    {
      title: "Email Templates",
      description: "Create and manage email templates with variables. Consistent branding across all communications.",
      icon: "📝"
    }
  ]

  const useCases = [
    {
      title: "SaaS Applications",
      description: "User onboarding flows, feature announcements, billing notifications, and account updates.",
      examples: ["Welcome email sequences", "Trial expiration notices", "Feature update announcements", "Account verification"]
    },
    {
      title: "E-commerce Platforms",
      description: "Order confirmations, shipping updates, abandoned cart recovery, and customer service automation.",
      examples: ["Order confirmation emails", "Shipping notifications", "Return request processing", "Customer support tickets"]
    },
    {
      title: "Customer Support",
      description: "AI-powered support agents, ticket routing, escalation workflows, and response automation.",
      examples: ["Auto-reply to common questions", "Ticket classification", "Escalation to human agents", "Follow-up surveys"]
    },
    {
      title: "Marketing Automation",
      description: "Drip campaigns, newsletter management, behavioral triggers, and engagement tracking.",
      examples: ["Welcome email series", "Newsletter subscriptions", "Event-based triggers", "Re-engagement campaigns"]
    },
    {
      title: "Internal Tools",
      description: "System alerts, monitoring notifications, report delivery, and team communications.",
      examples: ["System health alerts", "Daily report delivery", "Error notifications", "Team updates"]
    },
    {
      title: "AI Applications",
      description: "Email-based AI assistants, document processing, content generation, and workflow automation.",
      examples: ["Email-to-task conversion", "Document summarization", "Content generation", "Smart routing"]
    }
  ]

  const integrations = [
    { name: "Next.js", logo: "⚡" },
    { name: "React", logo: "⚛️" },
    { name: "Node.js", logo: "🟢" },
    { name: "Python", logo: "🐍" },
    { name: "OpenAI", logo: "🤖" },
    { name: "Anthropic", logo: "🧠" },
    { name: "Vercel", logo: "▲" },
    { name: "Railway", logo: "🚂" }
  ]

  return (
    <div className="min-h-screen">
      <SiteHeader />
      
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground mb-6">
            Complete Email Infrastructure
            <br />
            <span className="text-primary">for Modern Applications</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
            Send transactional emails, receive inbound messages, and build AI email agents with our TypeScript SDK and webhook API. 
            Everything you need to handle email in your application.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="primary" asChild>
              <Link href="/login">Get Started Free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="https://docs.inbound.new">View Documentation</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Core Features */}
      <section className="bg-muted/30 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-semibold text-foreground mb-4">
              Three Core Capabilities
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to build email-powered applications, from simple notifications to complex AI workflows.
            </p>
          </div>
          
          <div className="space-y-24">
            {coreFeatures.map((feature, index) => (
              <div key={index} className={`grid lg:grid-cols-2 gap-8 lg:gap-16 items-center ${index % 2 === 1 ? 'lg:grid-flow-col-dense' : ''}`}>
                <div className={index % 2 === 1 ? 'lg:col-start-2' : ''}>
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h3 className="text-2xl sm:text-3xl font-semibold mb-4">{feature.title}</h3>
                  <p className="text-lg text-muted-foreground mb-6">{feature.description}</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {feature.features.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                        <span className="text-sm text-muted-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={index % 2 === 1 ? 'lg:col-start-1' : ''}>
                  <div className="bg-background border border-border rounded-lg overflow-hidden">
                    <div className="py-2 px-4 bg-muted/30 border-b border-border font-mono text-xs flex items-center gap-2 text-muted-foreground">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="ml-2">example.ts</span>
                    </div>
                    <CodeBlock
                      code={feature.codeExample}
                      language="typescript"
                      copy={false}
                      variant="ghost"
                      size="sm"
                      className="rounded-none border-0 m-0 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Developer Features Grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-semibold text-foreground mb-4">
              Built for Developers
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Developer-first tools and features that make email integration simple and reliable.
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {developerFeatures.map((feature, index) => (
              <div key={index} className="bg-background border border-border rounded-lg p-6 hover:shadow-lg transition-shadow">
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="bg-muted/30 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-semibold text-foreground mb-4">
              Perfect for Any Use Case
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From simple transactional emails to complex AI workflows, Inbound scales with your needs.
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {useCases.map((useCase, index) => (
              <div key={index} className="bg-background border border-border rounded-lg p-6">
                <h3 className="text-xl font-semibold mb-3">{useCase.title}</h3>
                <p className="text-muted-foreground mb-4">{useCase.description}</p>
                <div className="space-y-2">
                  {useCase.examples.map((example, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-1 h-1 bg-primary rounded-full"></div>
                      <span className="text-sm text-muted-foreground">{example}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-semibold text-foreground mb-4">
              Works with Your Stack
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Integrate seamlessly with your existing tools and frameworks.
            </p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {integrations.map((integration, index) => (
              <div key={index} className="bg-background border border-border rounded-lg p-4 text-center hover:shadow-lg transition-shadow">
                <div className="text-2xl mb-2">{integration.logo}</div>
                <div className="text-sm font-medium">{integration.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section className="bg-muted/30 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-semibold text-foreground mb-4">
            Start Building Today
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Free tier includes 1,000 emails per month. No credit card required to get started.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Button size="lg" variant="primary" asChild>
              <Link href="/login">Get Started Free</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Questions? <Link href="mailto:support@inbound.new" className="text-primary hover:underline">Contact our team</Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-sidebar py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <InboundIcon width={32} height={32} />
              <span className="text-xl font-semibold text-foreground">inbound</span>
            </div>
            <div className="flex gap-8 text-sm text-muted-foreground">
              <Link href="https://docs.inbound.new" className="hover:text-foreground transition-colors">docs</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">privacy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">terms</Link>
              <a href="mailto:support@inbound.new" className="hover:text-foreground transition-colors">support</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} inbound. The complete email infrastructure for developers.
          </div>
        </div>
      </footer>
    </div>
  )
}