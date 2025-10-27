"use client"

import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import InboundIcon from "@/components/icons/inbound"
import CircleCheck from "@/components/icons/circle-check"
import PaperPlane2 from "@/components/icons/paper-plane-2"
import InboxArrowDown from "@/components/icons/inbox-arrow-down"
import Microchip from "@/components/icons/microchip"
import Shield2 from "@/components/icons/shield-2"
import Code2 from "@/components/icons/code-2"
import ChartActivity2 from "@/components/icons/chart-activity-2"
import Globe2 from "@/components/icons/globe-2"
import CloudArrowDown from "@/components/icons/cloud-arrow-down"
import BoltCircle from "@/components/icons/bolt-circle"
import Webhook from "@/components/icons/webhook"
import Email from "@/components/icons/email"

export default function FeaturesPage() {
  const coreFeatures = [
    {
      icon: <PaperPlane2 width="24" height="24" />,
      title: "Transactional Email Sending",
      description: "Reliable delivery of confirmations, notifications, and alerts with high deliverability rates.",
      features: [
        "Send via REST API",
        "Template support",
        "Bulk email sending",
        "Custom HTML/text content",
        "Attachment support",
        "Email tags & metadata",
      ]
    },
    {
      icon: <InboxArrowDown width="24" height="24" />,
      title: "Inbound Email Processing",
      description: "Receive emails via webhooks and access structured, parsed content instantly.",
      features: [
        "Webhook delivery",
        "HTML & text parsing",
        "Header extraction",
        "Custom routing rules",
        "Email forwarding",
        "Spam filtering",
      ]
    },
    {
      icon: <Email width="24" height="24" />,
      title: "Email Threading",
      description: "Automatically organize conversations into threads with full context preservation.",
      features: [
        "Automatic threading",
        "Thread context tracking",
        "Reply detection",
        "Conversation history",
        "Thread-aware replies",
        "In-reply-to handling",
      ]
    },
    {
      icon: <Microchip width="24" height="24" />,
      title: "AI Email Agents",
      description: "Integrate AI to classify, summarize, and auto-reply with full thread context.",
      features: [
        "Email classification",
        "AI-powered replies",
        "Context-aware responses",
        "Custom AI prompts",
        "Sentiment analysis",
        "Smart routing",
      ]
    },
  ]

  const developerFeatures = [
    {
      icon: <Code2 width="24" height="24" />,
      title: "TypeScript SDK",
      description: "Type-safe SDK with full IntelliSense support for Node.js and browser environments.",
      features: [
        "Fully typed interfaces",
        "Promise-based API",
        "Auto-complete support",
        "Error handling",
        "Framework agnostic",
        "Tree-shakeable",
      ]
    },
    {
      icon: <Webhook width="24" height="24" />,
      title: "Webhook System",
      description: "Reliable webhook delivery with signature verification and automatic retries.",
      features: [
        "HMAC signature verification",
        "Automatic retries",
        "Exponential backoff",
        "Webhook logs",
        "Custom retry policies",
        "Webhook testing tools",
      ]
    },
    {
      icon: <Globe2 width="24" height="24" />,
      title: "REST API",
      description: "Clean, consistent REST API with comprehensive OpenAPI documentation.",
      features: [
        "OpenAPI 3.0 spec",
        "Predictable endpoints",
        "Idempotent operations",
        "Rate limiting",
        "API versioning",
        "Clear error messages",
      ]
    },
    {
      icon: <CloudArrowDown width="24" height="24" />,
      title: "Attachment Handling",
      description: "Secure storage and retrieval of email attachments with S3 integration.",
      features: [
        "Automatic S3 storage",
        "Secure file access",
        "Size limit handling",
        "MIME type detection",
        "Attachment URLs",
        "Download tracking",
      ]
    },
  ]

  const infrastructureFeatures = [
    {
      icon: <Shield2 width="24" height="24" />,
      title: "Security & Compliance",
      description: "Enterprise-grade security with spam filtering and authentication.",
      features: [
        "DKIM signing",
        "SPF validation",
        "DMARC compliance",
        "Spam filtering",
        "API key authentication",
        "Rate limiting",
      ]
    },
    {
      icon: <ChartActivity2 width="24" height="24" />,
      title: "Analytics & Monitoring",
      description: "Track email delivery, opens, clicks, and overall system health.",
      features: [
        "Delivery tracking",
        "Open rate tracking",
        "Click tracking (via dub.co)",
        "Bounce handling",
        "Real-time logs",
        "Usage analytics",
      ]
    },
    {
      icon: <Globe2 width="24" height="24" />,
      title: "Domain Management",
      description: "Manage custom domains with automatic DNS configuration and verification.",
      features: [
        "Custom domain setup",
        "DNS verification",
        "Automatic DKIM setup",
        "Subdomain support",
        "Domain health checks",
        "Multiple domains",
      ]
    },
    {
      icon: <BoltCircle width="24" height="24" />,
      title: "High Availability",
      description: "Built for scale with 99.9% uptime SLA and automatic failover.",
      features: [
        "99.9% uptime SLA",
        "Global CDN",
        "Auto-scaling",
        "Load balancing",
        "Redundant storage",
        "24/7 monitoring",
      ]
    },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      <SiteHeader />

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20 text-center">
        <Badge className="gap-2 mb-6">
          <span className="inline-flex items-center justify-center text-[#7C3AED]">
            <InboundIcon width={12} height={12} />
          </span>
          <span className="text-sm">Platform Features</span>
        </Badge>
        <h1 className="text-4xl md:text-5xl mb-6 leading-tight font-semibold tracking-tight">
          Everything you need for email
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed tracking-normal">
          A complete email platform with sending, receiving, threading, AI integration,
          and developer tools. Built for modern applications.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button variant="primary" size="lg" asChild>
            <Link href="/login">Get Started Free</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/docs">View Documentation</Link>
          </Button>
        </div>
      </section>

      {/* Core Email Features */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-4 tracking-tight">Core Email Features</h2>
          <p className="text-muted-foreground tracking-normal">
            Send, receive, and manage email programmatically with our unified API
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {coreFeatures.map((feature, index) => (
            <div
              key={index}
              className="bg-card border border-border border-dotted rounded-none p-8"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-[#7C3AED]/10 to-[#7C3AED]/20 flex items-center justify-center text-[#7C3AED] mb-6">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold mb-3 tracking-tight">{feature.title}</h3>
              <p className="text-muted-foreground mb-6 tracking-normal">
                {feature.description}
              </p>
              <div className="space-y-3">
                {feature.features.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CircleCheck 
                      width="16" 
                      height="16" 
                      className="text-foreground mt-0.5 flex-shrink-0" 
                      fill="currentColor" 
                      secondaryfill="var(--muted-foreground)" 
                    />
                    <span className="text-sm text-muted-foreground tracking-normal">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Developer Tools */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-4 tracking-tight">Developer Tools</h2>
          <p className="text-muted-foreground tracking-normal">
            Built for developers with comprehensive tools and documentation
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {developerFeatures.map((feature, index) => (
            <div
              key={index}
              className="bg-card border border-border border-dotted rounded-none p-8"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-[#7C3AED]/10 to-[#7C3AED]/20 flex items-center justify-center text-[#7C3AED] mb-6">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold mb-3 tracking-tight">{feature.title}</h3>
              <p className="text-muted-foreground mb-6 tracking-normal">
                {feature.description}
              </p>
              <div className="space-y-3">
                {feature.features.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CircleCheck 
                      width="16" 
                      height="16" 
                      className="text-foreground mt-0.5 flex-shrink-0" 
                      fill="currentColor" 
                      secondaryfill="var(--muted-foreground)" 
                    />
                    <span className="text-sm text-muted-foreground tracking-normal">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Infrastructure & Reliability */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h2 className="text-3xl font-semibold mb-4 tracking-tight">Infrastructure & Reliability</h2>
          <p className="text-muted-foreground tracking-normal">
            Enterprise-grade infrastructure built for scale and reliability
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {infrastructureFeatures.map((feature, index) => (
            <div
              key={index}
              className="bg-card border border-border border-dotted rounded-none p-8"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-[#7C3AED]/10 to-[#7C3AED]/20 flex items-center justify-center text-[#7C3AED] mb-6">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold mb-3 tracking-tight">{feature.title}</h3>
              <p className="text-muted-foreground mb-6 tracking-normal">
                {feature.description}
              </p>
              <div className="space-y-3">
                {feature.features.map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CircleCheck 
                      width="16" 
                      height="16" 
                      className="text-foreground mt-0.5 flex-shrink-0" 
                      fill="currentColor" 
                      secondaryfill="var(--muted-foreground)" 
                    />
                    <span className="text-sm text-muted-foreground tracking-normal">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-semibold mb-4 tracking-tight">Complete Feature Set</h2>
          <p className="text-muted-foreground tracking-normal">
            Everything included in every plan
          </p>
        </div>

        <div className="bg-card border border-border border-dotted rounded-none overflow-hidden">
          <div className="grid md:grid-cols-3 gap-px bg-border">
            {/* Sending */}
            <div className="bg-card p-6">
              <h3 className="font-semibold mb-4 tracking-tight">Sending</h3>
              <ul className="space-y-2 text-sm text-muted-foreground tracking-normal">
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  REST API
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Email templates
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Bulk sending
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Attachments
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Custom headers
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Tags & metadata
                </li>
              </ul>
            </div>

            {/* Receiving */}
            <div className="bg-card p-6">
              <h3 className="font-semibold mb-4 tracking-tight">Receiving</h3>
              <ul className="space-y-2 text-sm text-muted-foreground tracking-normal">
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Webhook delivery
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Email parsing
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Attachment handling
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Custom routing
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Email threading
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Spam filtering
                </li>
              </ul>
            </div>

            {/* Platform */}
            <div className="bg-card p-6">
              <h3 className="font-semibold mb-4 tracking-tight">Platform</h3>
              <ul className="space-y-2 text-sm text-muted-foreground tracking-normal">
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  TypeScript SDK
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Domain management
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  Analytics & logs
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  99.9% uptime SLA
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  AI integration
                </li>
                <li className="flex items-start gap-2">
                  <CircleCheck width="16" height="16" className="text-foreground mt-0.5 flex-shrink-0" />
                  24/7 support
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="border border-dotted rounded-none p-12 text-center">
          <h2 className="text-4xl font-semibold mb-6 text-foreground tracking-tight">
            Ready to build with inbound?
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto tracking-normal">
            Start with 5,000 free emails per month. No credit card required.
            Scale as you grow.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Button
              size="lg"
              variant="primary"
              className="font-medium px-8 py-4 text-lg"
              asChild
            >
              <Link href="/login">Start Free</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-medium px-8 py-4 text-lg"
              asChild
            >
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto text-left">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground mb-1">2 min</div>
              <div className="text-sm text-muted-foreground tracking-normal">setup time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground mb-1">99.9%</div>
              <div className="text-sm text-muted-foreground tracking-normal">uptime SLA</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground mb-1">5,000</div>
              <div className="text-sm text-muted-foreground tracking-normal">emails/month free</div>
            </div>
          </div>
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
            © {new Date().getFullYear()} inbound (by exon). The all-in-one email toolkit for developers.
          </div>
        </div>
      </footer>
    </div>
  )
}
