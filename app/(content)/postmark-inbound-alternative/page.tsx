import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PricingTable } from "@/components/autumn/pricing-table-format" 
import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import CustomInboundIcon from "@/components/icons/customInbound"
import type { Metadata } from 'next'
import Link from 'next/link'

// Nucleo icon imports
import ArrowBoldRight from "@/components/icons/arrow-bold-right"
import Envelope2 from "@/components/icons/envelope-2"
import Globe2 from "@/components/icons/globe-2"
import ShieldCheck from "@/components/icons/shield-check"
import CircleCheck from "@/components/icons/circle-check"
import BoltLightning from "@/components/icons/bolt-lightning"
import TabClose from "@/components/icons/tab-close"
import Microchip from "@/components/icons/microchip"
import CircleSparkle from "@/components/icons/circle-sparkle"
import Check2 from "@/components/icons/check-2"
import InboundIcon from "@/components/icons/inbound"
import Code2 from "@/components/icons/code-2"
import SackDollar from "@/components/icons/sack-dollar"
import Settings3 from "@/components/icons/settings-3"
import Timer from "@/components/icons/timer"
import Database2 from "@/components/icons/database-2"

export const metadata: Metadata = {
  title: 'Best Postmark Inbound Alternative - Affordable Email Processing API | inbound',
  description: 'Switch from expensive Postmark inbound processing to inbound. Get unlimited email parsing, TypeScript SDK, and webhooks for 80% less cost. No per-email fees.',
  keywords: [
    'Postmark alternative',
    'Postmark inbound alternative', 
    'inbound email API',
    'email processing API',
    'webhook email service',
    'email to webhook',
    'cheaper than Postmark',
    'email infrastructure',
    'TypeScript email SDK',
    'unlimited email processing',
    'Postmark replacement',
    'email parsing service',
    'inbound email processing',
    'webhook email integration'
  ],
  openGraph: {
    title: 'Best Postmark Inbound Alternative - Affordable Email Processing API',
    description: 'Switch from expensive Postmark inbound processing to inbound. Get unlimited email parsing, TypeScript SDK, and webhooks for 80% less cost.',
    type: 'website',
    url: 'https://inbound.new/postmark-inbound-alternative',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Best Postmark Inbound Alternative - Affordable Email Processing API',
    description: 'Switch from expensive Postmark inbound processing to inbound. Get unlimited email parsing, TypeScript SDK, and webhooks for 80% less cost.',
  },
  alternates: {
    canonical: 'https://inbound.new/postmark-inbound-alternative'
  }
}

export default async function PostmarkAlternativePage() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  return (
    <div className="min-h-screen bg-white">
      {/* Main Content */}
      <main className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Section */}
          <div className="mb-16">
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <CircleCheck width="16" height="16" />
              #1 Postmark Inbound Alternative
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              <span className="text-[#1C2894]">Postmark Inbound</span>
              <br />
              Alternative That Costs 80% Less
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-2xl mx-auto leading-relaxed">
              Stop paying premium prices for basic inbound email processing. Get unlimited email parsing, 
              modern TypeScript SDK, and powerful webhooks for a fraction of Postmark's cost.
            </p>

            <div className="flex items-center gap-4 max-w-md mx-auto mt-8">
              <Input type="email" placeholder="hello@yourdomain.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Start Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Start Free
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>

            <p className="text-sm text-gray-500 mt-3">
              No credit card required • 1,000 emails/month free • Better features
            </p>
          </div>

          {/* Cost Comparison */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Stop Paying Premium for Basic Features</h2>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto text-left">
              {/* Postmark Column */}
              <div className="bg-orange-50 rounded-xl p-8 border border-orange-200">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold">
                    PM
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Postmark Inbound</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <SackDollar width="20" height="20" className="text-orange-500 mt-0.5 shrink-0" />
                    <span className="text-gray-600">$1.25 per 1,000 emails</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <SackDollar width="20" height="20" className="text-orange-500 mt-0.5 shrink-0" />
                    <span className="text-gray-600">$125/month for 100k emails</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <TabClose width="20" height="20" className="text-red-500 mt-0.5 shrink-0" />
                    <span className="text-gray-600">No free tier</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <TabClose width="20" height="20" className="text-red-500 mt-0.5 shrink-0" />
                    <span className="text-gray-600">Basic webhook payload</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <TabClose width="20" height="20" className="text-red-500 mt-0.5 shrink-0" />
                    <span className="text-gray-600">No TypeScript SDK</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <TabClose width="20" height="20" className="text-red-500 mt-0.5 shrink-0" />
                    <span className="text-gray-600">Limited email threading</span>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-orange-100 rounded-lg">
                  <p className="text-orange-800 font-semibold">100k emails/month = $125</p>
                  <p className="text-orange-600 text-sm">Premium pricing for basic features</p>
                </div>
              </div>

              {/* inbound Column */}
              <div className="bg-linear-to-br from-blue-50 to-purple-50 rounded-xl p-8 border border-blue-200">
                <div className="flex items-center gap-3 mb-6">
                  <CustomInboundIcon
                    className="shrink-0"
                    backgroundColor="#1C2894"
                    Icon={CircleSparkle}
                    size={40}
                  />
                  <h3 className="text-xl font-bold text-gray-900">inbound by exon</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">1,000 emails/month FREE</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">$25/month for 100k emails</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">Forever free tier</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">Rich, structured webhook data</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">Full TypeScript SDK included</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Check2 width="20" height="20" className="text-green-500 mt-0.5 shrink-0" />
                    <span className="text-gray-700 font-medium">Advanced email threading</span>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-green-100 rounded-lg">
                  <p className="text-green-800 font-semibold">100k emails/month = $25</p>
                  <p className="text-green-600 text-sm">80% less than Postmark with better features</p>
                </div>
              </div>
            </div>
          </div>

          {/* Why Switch Section */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Why Teams Switch from Postmark Inbound</h2>
            
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Cost */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <SackDollar width="32" height="32" className="text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">80% Cost Savings</h3>
                <p className="text-gray-600">
                  Process 100k emails for $25/month instead of $125. Save thousands annually while getting better features.
                </p>
              </div>

              {/* Modern SDK */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Code2 width="32" height="32" className="text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Modern TypeScript SDK</h3>
                <p className="text-gray-600">
                  Get full type safety, IntelliSense, and structured data that Postmark's basic webhooks can't provide.
                </p>
              </div>

              {/* Better Features */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Settings3 width="32" height="32" className="text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Better Features</h3>
                <p className="text-gray-600">
                  Email threading, conversation tracking, structured parsing, and advanced webhook capabilities.
                </p>
              </div>
            </div>
          </div>

          {/* Feature Comparison */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Postmark vs inbound: Feature Comparison</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full max-w-4xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold text-gray-900">Feature</th>
                    <th className="px-6 py-4 text-center font-semibold text-gray-900">Postmark</th>
                    <th className="px-6 py-4 text-center font-semibold text-gray-900">inbound</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 font-medium text-gray-900">Free Tier</td>
                    <td className="px-6 py-4 text-center">
                      <TabClose width="20" height="20" className="text-red-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Check2 width="20" height="20" className="text-green-500 mx-auto" />
                    </td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">TypeScript SDK</td>
                    <td className="px-6 py-4 text-center">
                      <TabClose width="20" height="20" className="text-red-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Check2 width="20" height="20" className="text-green-500 mx-auto" />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-medium text-gray-900">Structured Email Data</td>
                    <td className="px-6 py-4 text-center">
                      <TabClose width="20" height="20" className="text-red-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Check2 width="20" height="20" className="text-green-500 mx-auto" />
                    </td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">Email Threading</td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-yellow-600 text-sm">Basic</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Check2 width="20" height="20" className="text-green-500 mx-auto" />
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 font-medium text-gray-900">Webhook Retries</td>
                    <td className="px-6 py-4 text-center">
                      <Check2 width="20" height="20" className="text-green-500 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Check2 width="20" height="20" className="text-green-500 mx-auto" />
                    </td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">100k emails/month</td>
                    <td className="px-6 py-4 text-center text-gray-600">$125</td>
                    <td className="px-6 py-4 text-center text-green-600 font-semibold">$25</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Code Comparison */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Developer Experience Comparison</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              See how inbound's TypeScript-first approach compares to Postmark's basic webhook format.
            </p>

            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto text-left">
              {/* Postmark Code */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">Postmark Inbound Webhook</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`// Postmark webhook handler
app.post('/postmark-webhook', (req, res) => {
  const email = req.body
  
  // Basic webhook payload
  console.log('From:', email.FromFull?.Email)
  console.log('Subject:', email.Subject)
  console.log('TextBody:', email.TextBody)
  console.log('HtmlBody:', email.HtmlBody)
  
  // Manual attachment processing
  if (email.Attachments) {
    email.Attachments.forEach(attachment => {
      // Base64 decode, file handling...
      const content = Buffer.from(
        attachment.Content, 'base64'
      )
    })
  }
  
  // No type safety, basic data structure
  res.status(200).send('OK')
})`}
                  </pre>
                </div>
              </div>

              {/* inbound Code */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">inbound TypeScript Webhook</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`// inbound webhook handler (TypeScript)
app.post('/inbound-webhook', (req, res) => {
  const { email }: InboundWebhookPayload = req.body
  
  // Rich, structured data with types
  const parsedEmail = email.parsedData
  
  // Full type safety and IntelliSense
  console.log('From:', parsedEmail.from.address)
  console.log('Name:', parsedEmail.from.name)
  console.log('Subject:', parsedEmail.subject)
  console.log('Text:', parsedEmail.textBody)
  console.log('HTML:', parsedEmail.htmlBody)
  
  // Attachments already processed and typed
  parsedEmail.attachments.forEach(attachment => {
    console.log('File:', attachment.filename)
    console.log('Size:', attachment.size)
    console.log('Type:', attachment.contentType)
    // Direct access to processed content
  })
  
  res.status(200).json({ success: true })
})`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Migration Steps */}
          <div className="mb-32">
            <div className="bg-linear-to-br from-green-50 to-blue-50 rounded-2xl p-12 border border-green-200 text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Migrate from Postmark in 3 Steps</h2>
              <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
                Keep your email flow working while switching to 80% cost savings and better features.
              </p>

              <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto text-left mb-8">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Setup Your Domain</h3>
                    <p className="text-gray-600 text-sm">Add your domain to inbound and verify with DNS records.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Update Webhook URLs</h3>
                    <p className="text-gray-600 text-sm">Replace Postmark webhook endpoints with inbound URLs.</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Deploy New Code</h3>
                    <p className="text-gray-600 text-sm">Update your webhook handlers to use our structured data format.</p>
                  </div>
                </div>
              </div>

              <Button variant="primary" size="lg" asChild>
                {session ? (
                  <Link href="/add" className="flex items-center gap-2">
                    Start Saving Money Now
                    <ArrowBoldRight width="16" height="16" />
                  </Link>
                ) : (
                  <Link href="/login" className="flex items-center gap-2">
                    Start Saving Money Now
                    <ArrowBoldRight width="16" height="16" />
                  </Link>
                )}
              </Button>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Perfect for Modern Applications</h2>
            
            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* SaaS Applications */}
              <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Database2 width="32" height="32" className="text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3 text-center">SaaS Applications</h3>
                <p className="text-gray-600 text-center">
                  Support tickets, user onboarding emails, and automated customer communication processing.
                </p>
              </div>

              {/* AI & Automation */}
              <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Microchip width="32" height="32" className="text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3 text-center">AI & Automation</h3>
                <p className="text-gray-600 text-center">
                  Feed emails to AI models for classification, sentiment analysis, and automated responses.
                </p>
              </div>

              {/* E-commerce */}
              <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Timer width="32" height="32" className="text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3 text-center">E-commerce</h3>
                <p className="text-gray-600 text-center">
                  Order confirmations, shipping updates, and customer service email processing.
                </p>
              </div>

              {/* Monitoring & Alerts */}
              <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
                <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck width="32" height="32" className="text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3 text-center">Monitoring & Alerts</h3>
                <p className="text-gray-600 text-center">
                  System alerts, monitoring notifications, and DevOps workflow integration.
                </p>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">Save 80% vs Postmark</h2>
            <p className="text-lg text-gray-600 mb-12 text-center max-w-2xl mx-auto">
              Start with 1,000 emails free. Scale affordably without Postmark's premium pricing.
            </p>
            <PricingTable />
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Ready to Save 80% on Email Processing?</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Join developers and startups who switched from Postmark's expensive inbound processing to our affordable, feature-rich alternative.
            </p>
            
            <div className="flex items-center gap-4 max-w-md mx-auto mb-6">
              <Input type="email" placeholder="your@domain.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Start Free Migration
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Start Free Migration  
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>

            <p className="text-sm text-gray-500">
              ✓ 1,000 emails/month free ✓ TypeScript SDK ✓ 5-minute setup ✓ Cancel anytime
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <InboundIcon width={24} height={24} />
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

