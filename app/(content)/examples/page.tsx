import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import type { Metadata } from 'next'
import Link from 'next/link'

// Nucleo icon imports
import ArrowBoldRight from "@/components/icons/arrow-bold-right"
import Envelope2 from "@/components/icons/envelope-2"
import Globe2 from "@/components/icons/globe-2"
import BoltLightning from "@/components/icons/bolt-lightning"
import CircleSparkle from "@/components/icons/circle-sparkle"
import Check2 from "@/components/icons/check-2"
import InboundIcon from "@/components/icons/inbound"
import Code2 from "@/components/icons/code-2"
import Timer from "@/components/icons/timer"
import Database2 from "@/components/icons/database-2"
import ShieldCheck from "@/components/icons/shield-check"
import Microchip from "@/components/icons/microchip"
import Gear2 from "@/components/icons/gear-2"
import SackDollar from "@/components/icons/sack-dollar"
import ChartActivity2 from "@/components/icons/chart-activity-2"

export const metadata: Metadata = {
  title: 'Email Processing Examples - Real-World Use Cases for Inbound Email API | inbound',
  description: 'Discover 6 powerful real-world examples of email processing automation. From customer support to e-commerce, see how businesses use inbound email APIs to automate workflows and boost productivity.',
  keywords: [
    'email processing examples',
    'inbound email use cases',
    'email automation examples',
    'customer support email automation',
    'email to webhook examples',
    'email API use cases',
    'email workflow automation',
    'inbound email processing',
    'email parsing examples',
    'email integration examples',
    'business email automation',
    'email-driven workflows',
    'automated email handling',
    'email processing patterns',
    'enterprise email automation',
    'email API integration examples',
    'real-world email automation',
    'email processing solutions'
  ],
  openGraph: {
    title: 'Email Processing Examples - Real-World Use Cases for Businesses',
    description: 'Discover 6 powerful real-world examples of email processing automation. See how businesses automate customer support, lead generation, monitoring, and more with inbound email APIs.',
    type: 'website',
    url: 'https://inbound.new/examples',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Email Processing Examples - Real-World Use Cases',
    description: 'Discover 6 powerful real-world examples of email processing automation. From customer support to e-commerce workflows.',
  },
  alternates: {
    canonical: 'https://inbound.new/examples'
  }
}

export default async function ExamplesPage() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Main Content */}
      <main className="px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Hero Section */}
          <div className="mb-16">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              <span className="text-primary">Real-World Examples</span>
              <br />
              of Email Automation
            </h1>
            <p className="text-xl text-muted-foreground mb-4 max-w-2xl mx-auto leading-relaxed">
              Discover how businesses and developers use inbound email processing to automate workflows, 
              boost productivity, and create seamless customer experiences. From support ticketing to 
              AI-powered classification, see what's possible.
            </p>

            <div className="flex items-center gap-4 max-w-md mx-auto mt-8">
              <Input type="email" placeholder="your-usecase@example.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Try Examples
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Try Examples
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mt-3">
              Start with 5,000 emails free • Ready-to-use examples • Full TypeScript support
            </p>
          </div>
        </div>

        {/* Examples Grid */}
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 mb-32">
            
            {/* Example 1: Customer Support Automation */}
            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <Envelope2 width="32" height="32" className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Customer Support Automation</h2>
                  <p className="text-muted-foreground">Transform support emails into organized tickets</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Auto-create tickets from support emails</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Route by priority, product, or team</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Extract customer data and order information</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Send automatic acknowledgments</span>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm mb-6">
                <div className="text-muted-foreground mb-2">// Automatic support ticket creation</div>
                <div className="text-accent-foreground">
                  <span className="text-blue-400">const</span> ticketData = &#123;
                </div>
                <div className="pl-4">
                  <div>subject: email.parsedData.subject,</div>
                  <div>customer: email.parsedData.from.address,</div>
                  <div>priority: extractPriority(email.parsedData.textBody),</div>
                  <div>category: classifyIssue(email.parsedData.textBody)</div>
                </div>
                <div className="text-accent-foreground">&#125;</div>
              </div>

              <div className="bg-linear-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <ChartActivity2 width="16" height="16" className="text-blue-600 dark:text-blue-400" />
                  Impact Metrics
                </h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-bold text-blue-600 dark:text-blue-400">40%</div>
                    <div className="text-muted-foreground">Faster response</div>
                  </div>
                  <div>
                    <div className="font-bold text-blue-600 dark:text-blue-400">85%</div>
                    <div className="text-muted-foreground">Auto-routing accuracy</div>
                  </div>
                  <div>
                    <div className="font-bold text-blue-600 dark:text-blue-400">60%</div>
                    <div className="text-muted-foreground">Less manual work</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Example 2: Lead Generation & CRM */}
            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                  <Globe2 width="32" height="32" className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Lead Generation & CRM</h2>
                  <p className="text-muted-foreground">Capture and qualify leads automatically</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Parse contact form submissions</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Extract lead qualification data</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Score leads based on content</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Sync to CRM automatically</span>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm mb-6">
                <div className="text-muted-foreground mb-2">// Lead scoring and CRM sync</div>
                <div className="text-accent-foreground">
                  <span className="text-green-400">const</span> lead = &#123;
                </div>
                <div className="pl-4">
                  <div>email: extractEmail(email.parsedData.textBody),</div>
                  <div>company: extractCompany(email.parsedData.textBody),</div>
                  <div>score: calculateLeadScore(content),</div>
                  <div>source: 'contact-form'</div>
                </div>
                <div className="text-accent-foreground">&#125;</div>
              </div>

              <div className="bg-linear-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <ChartActivity2 width="16" height="16" className="text-green-600 dark:text-green-400" />
                  Lead Quality Boost
                </h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-bold text-green-600 dark:text-green-400">3x</div>
                    <div className="text-muted-foreground">Faster lead processing</div>
                  </div>
                  <div>
                    <div className="font-bold text-green-600 dark:text-green-400">92%</div>
                    <div className="text-muted-foreground">Data accuracy</div>
                  </div>
                  <div>
                    <div className="font-bold text-green-600 dark:text-green-400">45%</div>
                    <div className="text-muted-foreground">Higher conversion</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Example 3: System Monitoring & DevOps */}
            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
                  <ShieldCheck width="32" height="32" className="text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">System Monitoring & Alerts</h2>
                  <p className="text-muted-foreground">Turn monitoring emails into actionable incidents</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Parse alerts from monitoring tools</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Create incidents in PagerDuty/Jira</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Route by severity and service</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Notify teams via Slack/Discord</span>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm mb-6">
                <div className="text-muted-foreground mb-2">// Alert processing pipeline</div>
                <div className="text-accent-foreground">
                  <span className="text-red-400">const</span> alert = &#123;
                </div>
                <div className="pl-4">
                  <div>severity: extractSeverity(email.subject),</div>
                  <div>service: parseServiceName(email.textBody),</div>
                  <div>metrics: extractMetrics(email.textBody),</div>
                  <div>assignee: routeByService(service)</div>
                </div>
                <div className="text-accent-foreground">&#125;</div>
              </div>

              <div className="bg-linear-to-r from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-lg p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Timer width="16" height="16" className="text-red-600 dark:text-red-400" />
                  Incident Response
                </h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-bold text-red-600 dark:text-red-400">70%</div>
                    <div className="text-muted-foreground">Faster MTTR</div>
                  </div>
                  <div>
                    <div className="font-bold text-red-600 dark:text-red-400">100%</div>
                    <div className="text-muted-foreground">Alert capture</div>
                  </div>
                  <div>
                    <div className="font-bold text-red-600 dark:text-red-400">5min</div>
                    <div className="text-muted-foreground">Avg response time</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Example 4: E-commerce Order Processing */}
            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                  <SackDollar width="32" height="32" className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">E-commerce Order Processing</h2>
                  <p className="text-muted-foreground">Automate order updates and fulfillment</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Parse order confirmations</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Extract shipping notifications</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Update inventory systems</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Trigger customer notifications</span>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm mb-6">
                <div className="text-muted-foreground mb-2">// Order status automation</div>
                <div className="text-accent-foreground">
                  <span className="text-purple-400">const</span> order = &#123;
                </div>
                <div className="pl-4">
                  <div>orderId: extractOrderId(email.subject),</div>
                  <div>status: parseOrderStatus(email.textBody),</div>
                  <div>tracking: extractTrackingNumber(email),</div>
                  <div>customer: email.parsedData.to[0].address</div>
                </div>
                <div className="text-accent-foreground">&#125;</div>
              </div>

              <div className="bg-linear-to-r from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <SackDollar width="16" height="16" className="text-purple-600 dark:text-purple-400" />
                  Order Efficiency
                </h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-bold text-purple-600 dark:text-purple-400">90%</div>
                    <div className="text-muted-foreground">Processing automation</div>
                  </div>
                  <div>
                    <div className="font-bold text-purple-600 dark:text-purple-400">2hrs</div>
                    <div className="text-muted-foreground">Avg update time</div>
                  </div>
                  <div>
                    <div className="font-bold text-purple-600 dark:text-purple-400">98%</div>
                    <div className="text-muted-foreground">Customer satisfaction</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Example 5: Content Management & Publishing */}
            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center">
                  <Code2 width="32" height="32" className="text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Content Management</h2>
                  <p className="text-muted-foreground">Email-to-content publishing workflows</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Convert emails to blog posts</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Extract documentation updates</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Parse newsletter submissions</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Auto-format and publish</span>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm mb-6">
                <div className="text-muted-foreground mb-2">// Email to content pipeline</div>
                <div className="text-accent-foreground">
                  <span className="text-yellow-600 dark:text-yellow-400">const</span> content = &#123;
                </div>
                <div className="pl-4">
                  <div>title: email.parsedData.subject,</div>
                  <div>body: formatMarkdown(email.textBody),</div>
                  <div>author: email.parsedData.from.name,</div>
                  <div>tags: extractTags(email.textBody)</div>
                </div>
                <div className="text-accent-foreground">&#125;</div>
              </div>

              <div className="bg-linear-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-lg p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <BoltLightning width="16" height="16" className="text-yellow-600 dark:text-yellow-400" />
                  Publishing Speed
                </h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-bold text-yellow-600 dark:text-yellow-400">80%</div>
                    <div className="text-muted-foreground">Time saved</div>
                  </div>
                  <div>
                    <div className="font-bold text-yellow-600 dark:text-yellow-400">5min</div>
                    <div className="text-muted-foreground">Email to publish</div>
                  </div>
                  <div>
                    <div className="font-bold text-yellow-600 dark:text-yellow-400">95%</div>
                    <div className="text-muted-foreground">Format accuracy</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Example 6: AI-Powered Email Classification */}
            <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
                  <Microchip width="32" height="32" className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">AI Email Classification</h2>
                  <p className="text-muted-foreground">Smart routing and automated responses</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Classify by intent and sentiment</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Generate contextual responses</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Extract key information</span>
                </div>
                <div className="flex items-center gap-3">
                  <Check2 width="16" height="16" className="text-green-500" />
                  <span className="text-sm">Route to appropriate teams</span>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm mb-6">
                <div className="text-muted-foreground mb-2">// AI classification workflow</div>
                <div className="text-accent-foreground">
                  <span className="text-indigo-400">const</span> analysis = &#123;
                </div>
                <div className="pl-4">
                  <div>intent: classifyIntent(email.textBody),</div>
                  <div>sentiment: analyzeSentiment(email.textBody),</div>
                  <div>priority: calculatePriority(analysis),</div>
                  <div>response: generateResponse(context)</div>
                </div>
                <div className="text-accent-foreground">&#125;</div>
              </div>

              <div className="bg-linear-to-r from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 rounded-lg p-4">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <CircleSparkle width="16" height="16" className="text-indigo-600 dark:text-indigo-400" />
                  AI Performance
                </h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-bold text-indigo-600 dark:text-indigo-400">94%</div>
                    <div className="text-muted-foreground">Classification accuracy</div>
                  </div>
                  <div>
                    <div className="font-bold text-indigo-600 dark:text-indigo-400">60%</div>
                    <div className="text-muted-foreground">Auto-response rate</div>
                  </div>
                  <div>
                    <div className="font-bold text-indigo-600 dark:text-indigo-400">10sec</div>
                    <div className="text-muted-foreground">Processing time</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Implementation Guide Section */}
        <div className="max-w-6xl mx-auto mb-32">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Ready to Implement These Examples?</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Each example can be set up in minutes using our TypeScript SDK and webhook system. 
              Start with our templates and customize for your specific use case.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Timer width="32" height="32" className="text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold mb-3">5-Minute Setup</h3>
              <p className="text-muted-foreground">
                Get your first email automation running in minutes with our SDK and examples.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Code2 width="32" height="32" className="text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-bold mb-3">Full Type Safety</h3>
              <p className="text-muted-foreground">
                TypeScript SDK with complete type definitions for all email data structures.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Gear2 width="32" height="32" className="text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-bold mb-3">Easy Customization</h3>
              <p className="text-muted-foreground">
                Modify examples to fit your workflow. Add custom parsing, routing, and integrations.
              </p>
            </div>
          </div>

          {/* Code Example */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/50">
              <h3 className="font-semibold">Universal Email Processing Template</h3>
            </div>
            <div className="p-6 font-mono text-sm">
              <pre className="text-accent-foreground whitespace-pre-wrap">
{`import { createInboundClient } from '@inboundemail/sdk'

const inbound = createInboundClient({
  apiKey: process.env.INBOUND_API_KEY
})

// Set up webhook for any use case
app.post('/webhook/email', async (req, res) => {
  const { email }: InboundWebhookPayload = req.body
  
  // Universal email data extraction
  const emailData = {
    from: email.parsedData.from.address,
    subject: email.parsedData.subject,
    content: email.parsedData.textBody,
    attachments: email.parsedData.attachments,
    timestamp: email.receivedAt
  }
  
  // Route based on your use case
  switch (detectUseCase(emailData)) {
    case 'support':
      await handleSupportTicket(emailData)
      break
    case 'lead':
      await processLead(emailData)
      break
    case 'monitor':
      await createIncident(emailData)
      break
    case 'order':
      await updateOrderStatus(emailData)
      break
    default:
      await processGenericEmail(emailData)
  }
  
  res.status(200).json({ success: true })
})`}
              </pre>
            </div>
          </div>
        </div>

        {/* Industries Section */}
        <div className="max-w-6xl mx-auto mb-32">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Industries Using Email Automation</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From startups to enterprise, see how different industries leverage inbound email processing 
              to streamline operations and improve customer experiences.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="text-2xl mb-3">🛒</div>
              <h4 className="font-semibold mb-2">E-commerce</h4>
              <p className="text-sm text-muted-foreground">Order processing, returns, customer support automation</p>
            </div>
            
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="text-2xl mb-3">🏥</div>
              <h4 className="font-semibold mb-2">Healthcare</h4>
              <p className="text-sm text-muted-foreground">Patient communications, appointment scheduling, lab results</p>
            </div>
            
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="text-2xl mb-3">🏢</div>
              <h4 className="font-semibold mb-2">SaaS</h4>
              <p className="text-sm text-muted-foreground">User onboarding, support ticketing, usage notifications</p>
            </div>
            
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="text-2xl mb-3">💰</div>
              <h4 className="font-semibold mb-2">Finance</h4>
              <p className="text-sm text-muted-foreground">Transaction alerts, compliance reporting, customer inquiries</p>
            </div>
            
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="text-2xl mb-3">🎓</div>
              <h4 className="font-semibold mb-2">Education</h4>
              <p className="text-sm text-muted-foreground">Student communications, grade notifications, enrollment processing</p>
            </div>
            
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="text-2xl mb-3">🏠</div>
              <h4 className="font-semibold mb-2">Real Estate</h4>
              <p className="text-sm text-muted-foreground">Lead qualification, property inquiries, document processing</p>
            </div>
            
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="text-2xl mb-3">📰</div>
              <h4 className="font-semibold mb-2">Media</h4>
              <p className="text-sm text-muted-foreground">Content submissions, subscription management, reader engagement</p>
            </div>
            
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="text-2xl mb-3">⚙️</div>
              <h4 className="font-semibold mb-2">DevOps</h4>
              <p className="text-sm text-muted-foreground">System monitoring, incident management, deployment notifications</p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-linear-to-br from-primary/10 via-primary/5 to-background rounded-3xl p-12">
            <h2 className="text-3xl font-bold mb-6">Start Building Your Email Automation</h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join thousands of developers using inbound to automate email workflows. 
              Get started with 5,000 free emails and build your first automation in minutes.
            </p>
            
            <div className="flex items-center gap-4 max-w-md mx-auto mb-6">
              <Input type="email" placeholder="your-workflow@example.com" />
              <Button variant="primary" asChild>
                {session ? (
                  <Link href="/add">
                    Start Building
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                ) : (
                  <Link href="/login">
                    Start Building
                    <ArrowBoldRight width="12" height="12" className="ml-2" />
                  </Link>
                )}
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-8">
              ✓ 5,000 emails/month free ✓ TypeScript SDK ✓ Ready-to-use examples ✓ No credit card required
            </p>

            <div className="grid md:grid-cols-3 gap-8 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary mb-1">6</div>
                <div className="text-sm text-muted-foreground">Real-world examples</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary mb-1">5min</div>
                <div className="text-sm text-muted-foreground">Setup time</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary mb-1">∞</div>
                <div className="text-sm text-muted-foreground">Customization possibilities</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-sidebar py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <InboundIcon width={32} height={32} />
              <span className="text-xl font-semibold">inbound</span>
            </div>
            <div className="flex gap-8 text-sm text-muted-foreground">
              <Link href="https://docs.inbound.new" className="hover:text-foreground transition-colors">Docs</Link>
              <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <a href="mailto:support@inbound.new" className="hover:text-foreground transition-colors">Support</a>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} inbound. Real-world email automation examples for modern developers.
          </div>
        </div>
      </footer>
    </div>
  )
}
