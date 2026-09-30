import type { Metadata } from "next"
import Link from "next/link"
import { MarketingNav, MarketingFooter } from "@/components/marketing-nav"

export const metadata: Metadata = {
  title: "Features",
  description: "Send, receive, and reply to email with one API: transactional sending, inbound webhooks, threading, and retries.",
  alternates: { canonical: "/features" },
}

export default function FeaturesPage() {
  const features = [
    {
      title: "Transactional sending",
      description: "Reliable API for receipts, notifications, and transactional messages at scale.",
    },
    {
      title: "Inbound as webhooks",
      description: "Receive email to your endpoints with structured JSON for headers, text, HTML, and files.",
    },
    {
      title: "Threaded conversations",
      description: "Group messages into conversation threads for full context across replies and participants.",
    },
    {
      title: "Webhooks & retries",
      description: "Deliver events to your services with robust retry logic and delivery logs.",
    },
    {
      title: "Security by default",
      description: "Protect your integration with API keys, HMAC signatures, and rate limits.",
    },
    {
      title: "AI-assisted workflows",
      description: "Use AI to classify, summarize, and draft replies with full thread context.",
    },
  ]

  const everythingIncluded = [
    "TypeScript SDK and REST API",
    "Open/click tracking (via dub.co)",
    "Configurable endpoints and routing",
    "Spam filtering and suppression list",
    "Domain setup with DKIM/SPF helpers",
    "Detailed logs and metrics",
    "Modern dashboard with search",
    "Examples and guides to get started",
  ]

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#1c1917] selection:bg-[#8161FF]/20">
      <div className="max-w-2xl mx-auto px-6">
        <MarketingNav />

        {/* Hero */}
        <section className="pt-20 pb-12">
          <h1 className="font-heading text-[32px] leading-[1.2] tracking-tight mb-2">Features</h1>
          <p className="text-[#52525b] leading-relaxed">
            The all‑in‑one email platform for developers. Send transactional emails, receive inbound messages as webhooks, and build AI‑powered workflows.
          </p>
        </section>

        {/* Features list */}
        <section className="py-8 border-t border-[#e7e5e4]">
          <div className="space-y-0">
            {features.map((feature) => (
              <div key={feature.title} className="py-4 border-b border-[#e7e5e4]">
                <p className="text-[#1c1917] font-medium">{feature.title}</p>
                <p className="text-sm text-[#52525b] mt-1">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Everything included */}
        <section className="py-12 border-t border-[#e7e5e4]">
          <h2 className="font-heading text-xl font-semibold tracking-tight mb-6">Everything included</h2>
          <div className="space-y-3">
            {everythingIncluded.map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm">
                <svg className="w-4 h-4 text-[#8161FF] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-[#3f3f46]">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-12 border-t border-[#e7e5e4]">
          <div className="text-center">
            <h2 className="font-heading text-xl font-semibold tracking-tight mb-2">Build better email experiences</h2>
            <p className="text-[#52525b] mb-6">Start free, integrate in minutes, and scale with confidence.</p>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/login"
                className="bg-[#8161FF] hover:bg-[#6b4fd9] text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Get started
              </Link>
              <Link
                href="/docs"
                className="bg-white border border-[#e7e5e4] hover:border-[#d6d3d1] text-[#1c1917] px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                Read the docs
              </Link>
            </div>
          </div>
        </section>

        <MarketingFooter />
      </div>
    </div>
  )
}
