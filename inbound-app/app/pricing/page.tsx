"use client"

import Link from 'next/link'
import Image from 'next/image'
import { Button } from "@/components/ui/button"
import { PricingTable } from "@/components/autumn/pricing-table-format"
import { SiteHeader } from "@/components/site-header"
import InboundIcon from '@/components/icons/inbound'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#1B1C1D] text-[#e5e5e5] font-['Outfit',sans-serif] relative">
      {/* CSS Variables for theme */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@100;200;300;400;500;600;700;800;900&display=swap');
        
        :root {
          --text-primary: #ffffff;
          --text-secondary: #b3b3b3;
          --text-muted: #888888;
          --purple-primary: #6C47FF;
          --purple-dark: #5a3bdb;
          --border-primary: #333333;
          --border-secondary: #2a2a2a;
          --bg-card: #1e1f20;
          --bg-card-hover: #252526;
        }
      `}</style>

      <SiteHeader />

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-16 leading-relaxed">
          Choose the plan that fits your needs. Start free, upgrade when you're ready.
          <br />
          All plans include our core email platform features.
        </p>

        {/* Pricing Table */}
        <div className="mt-16">
          <PricingTable />
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-[#0f0f0f] py-20">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-4">Frequently asked questions</h2>
          <p className="text-[var(--text-secondary)] text-center mb-12">
            Got questions? We've got answers.
          </p>
          
          <div className="space-y-6">
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">What counts as an email?</h3>
              <p className="text-[var(--text-secondary)]">
                Both sent and received emails count toward your monthly limit. Each individual recipient counts as one email (so sending to 3 people = 3 emails).
              </p>
            </div>
            
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">Can I change plans anytime?</h3>
              <p className="text-[var(--text-secondary)]">
                Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately and we'll prorate any billing differences.
              </p>
            </div>
            
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-2">What happens if I exceed my limit?</h3>
              <p className="text-[var(--text-secondary)]">
                We'll notify you when you're approaching your limit. If you exceed it, we'll pause email sending until you upgrade or the next billing cycle starts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
        <p className="text-lg text-[var(--text-secondary)] mb-12">
          Join thousands of developers who trust Inbound for their email infrastructure.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-[var(--purple-primary)] hover:bg-[var(--purple-dark)] text-white border-0 font-medium px-8 py-3"
            asChild
          >
            <Link href="/login">start free</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-[var(--purple-primary)] text-[var(--purple-primary)] hover:bg-[var(--purple-primary)] hover:text-white font-medium px-8 py-3"
            asChild
          >
            <Link href="mailto:support@inbound.new">contact sales</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border-secondary)] bg-[#0a0a0a] py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <InboundIcon variant="primary" width={32} height={32} />
              <span className="text-xl font-semibold text-[var(--text-primary)]">inbound</span>
            </div>
            <div className="flex gap-8 text-sm text-[var(--text-muted)]">
              <Link href="https://docs.inbound.new" className="hover:text-[var(--purple-primary)] transition-colors">docs</Link>
              <Link href="/privacy" className="hover:text-[var(--purple-primary)] transition-colors">privacy</Link>
              <Link href="/terms" className="hover:text-[var(--purple-primary)] transition-colors">terms</Link>
              <a href="mailto:support@inbound.new" className="hover:text-[var(--purple-primary)] transition-colors">support</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-[var(--border-secondary)] text-center text-sm text-[var(--text-muted)]">
            © {new Date().getFullYear()} inbound (by exon). The all-in-one email toolkit for developers.
          </div>
        </div>
      </footer>
    </div>
  )
}
