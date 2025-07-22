"use server"

import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth/auth"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import ArrowBoldDown from "@/components/icons/arrow-bold-down"
import ArrowBoldRight from "@/components/icons/arrow-bold-right"
import { AnimatedCard } from "@/components/AnimatedCard"
import { AnimatedSection } from "@/components/AnimatedSection"
import Image from "next/image"
import { PricingTable } from "@/components/autumn/pricing-table-format"
import Envelope2 from "@/components/icons/envelope-2"
import BoltLightning from "@/components/icons/bolt-lightning"
import Globe2 from "@/components/icons/globe-2"
import Database2 from "@/components/icons/database-2"
import ChartActivity2 from "@/components/icons/chart-activity-2"
import Shield2 from "@/components/icons/shield-2"
import Code2 from "@/components/icons/code-2"
import UserGroup from "@/components/icons/user-group"
import CircleCheck from "@/components/icons/circle-check"
import TabClose from "@/components/icons/tab-close"
import Gear2 from "@/components/icons/gear-2"
import { HeroSection } from "@/components/landing/HeroSection"
import { MobileMenu } from "@/components/landing/MobileMenu"
import { headers } from "next/headers"
import EnvelopePlus from "@/components/icons/envelope-plus"
import EnvelopeOpen from "@/components/icons/envelope-open"
import Folder2 from "@/components/icons/folder-2"
import Microchip from "@/components/icons/microchip"
import Lightbulb from "@/components/icons/lightbulb"
import ArrowUpRight2 from "@/components/icons/arrow-up-right-2"

export default async function AIAgentLandingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const isLoggedIn = !!session?.user

  return (
    <div className="bg-background">
      <div className="min-h-screen font-sans relative rounded-b-[30px] sm:rounded-b-[50px] tracking-tight flex flex-col justify-center items-center px-2 xs:px-4 sm:px-6 md:px-12">
        {/* Header */}
        <AnimatedSection direction="down" className="w-full">
          <header className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-6 bg-background w-full">
            <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <Image
                  src="https://inbound.new/inbound-logo-3.png"
                  alt="Inbound Logo"
                  width={28}
                  height={28}
                  className="rounded-lg shadow-sm sm:w-8 sm:h-8"
                />
                <span className="font-semibold text-base sm:text-lg text-foreground">inbound</span>
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  AI Agents
                </Badge>
              </div>
              <div className="flex items-center gap-2 sm:gap-4">
                <MobileMenu />
                <div className="hidden md:flex items-center gap-4">
                  <Button variant="secondary" asChild>
                    <a href="/docs" target="_blank" rel="noopener noreferrer">
                      API Docs
                    </a>
                  </Button>
                  {isLoggedIn ? (
                    <Button asChild>
                      <a href="/mail">Go to inbound</a>
                    </Button>
                  ) : (
                    <Button asChild>
                      <a href="/login">Get Started</a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </header>
        </AnimatedSection>

        {/* AI Agent Hero Section */}
        <AnimatedSection className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-16 text-center">
          <div className="mb-6 sm:mb-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm mb-4">
              <Lightbulb width="16" height="16" />
              <span>Email Infrastructure for AI Agents</span>
            </div>
            <h1 className="text-3xl xs:text-4xl sm:text-5xl lg:text-6xl font-medium mb-4 sm:mb-6 text-foreground leading-tight">
              Give your AI agents
              <br />
              <span className="text-primary">real email superpowers</span>
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg lg:text-xl max-w-3xl mx-auto mb-6 sm:mb-8 leading-relaxed px-4">
              Full email capabilities for autonomous AI agents. Send, receive, and manage emails programmatically with our powerful v2 API designed specifically for AI workflows.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button size="lg" asChild className="min-w-[200px]">
                <a href="/login">
                  Start Building
                  <ArrowBoldRight width="16" height="16" className="ml-2" />
                </a>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="/docs" target="_blank">
                  View API v2 Docs
                </a>
              </Button>
            </div>
          </div>

          {/* Feature badges */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-8">
            <Badge variant="secondary" className="px-3 py-1.5">
              <ArrowUpRight2 width="14" height="14" className="mr-1" />
              Send Emails
            </Badge>
            <Badge variant="secondary" className="px-3 py-1.5">
              <EnvelopeOpen width="14" height="14" className="mr-1" />
              Receive Emails
            </Badge>
            <Badge variant="secondary" className="px-3 py-1.5">
              <Folder2 width="14" height="14" className="mr-1" />
              Agent Mailboxes
            </Badge>
            <Badge variant="secondary" className="px-3 py-1.5">
              <BoltLightning width="14" height="14" className="mr-1" />
              Webhook Events
            </Badge>
          </div>
        </AnimatedSection>

        {/* AI Agent Email Workflow Visualization */}
        <AnimatedSection className="px-4 sm:px-6 max-w-6xl mx-auto py-12 sm:py-20">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl xs:text-3xl sm:text-4xl font-medium mb-4 text-foreground">
              Complete email lifecycle for AI agents
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mx-auto">
              From receiving customer inquiries to sending intelligent responses, handle every email interaction programmatically
            </p>
          </div>

          <div className="space-y-6 sm:space-y-8">
            {/* Step 1: Email Received */}
            <AnimatedCard
              className="bg-card border border-border rounded-xl shadow-lg max-w-3xl mx-auto"
              delay={100}
            >
              <CardContent className="p-0">
                <div className="flex items-center gap-3 p-4 sm:p-6 bg-muted/50 rounded-t-xl">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-primary font-semibold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Customer Email Received</h3>
                    <p className="text-sm text-muted-foreground">support@youragent.ai receives an inquiry</p>
                  </div>
                </div>
                <div className="p-4 sm:p-6 space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-16">From:</span>
                    <span className="text-foreground">customer@example.com</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground w-16">Subject:</span>
                    <span className="text-foreground">How do I integrate your API?</span>
                  </div>
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-foreground">
                      Hi, I'm trying to integrate your API into my application but I'm having trouble with authentication. Can you help?
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <Badge variant="secondary" className="bg-green-500/20 text-green-600">
                      <CircleCheck width="12" height="12" className="mr-1" />
                      Received
                    </Badge>
                    <Badge variant="secondary" className="bg-blue-500/20 text-blue-600">
                      <BoltLightning width="12" height="12" className="mr-1" />
                      Webhook triggered
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </AnimatedCard>

            <div className="flex justify-center">
              <ArrowBoldDown width="24" height="24" className="text-muted-foreground" />
            </div>

            {/* Step 2: AI Agent Processing */}
            <AnimatedCard
              className="bg-neutral-900 rounded-xl shadow-lg max-w-3xl mx-auto"
              delay={200}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-primary-foreground font-semibold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">AI Agent Processes Email</h3>
                    <p className="text-sm text-gray-400">Your agent receives the webhook and analyzes the request</p>
                  </div>
                </div>
                <div className="bg-neutral-800 rounded-lg p-4 font-mono text-sm">
                  <div className="text-green-400">// Webhook received at your AI agent</div>
                  <div className="text-blue-400 mt-2">const emailData = {`{`}</div>
                  <div className="ml-4 text-gray-300">
                    <div>from: <span className="text-green-300">"customer@example.com"</span>,</div>
                    <div>subject: <span className="text-green-300">"How do I integrate your API?"</span>,</div>
                    <div>body: <span className="text-green-300">"Hi, I'm trying to integrate..."</span>,</div>
                    <div>mailboxId: <span className="text-yellow-300">"support_mailbox_123"</span></div>
                  </div>
                  <div className="text-blue-400">{`}`}</div>
                  <div className="text-gray-500 mt-3">// AI analyzes intent and generates response...</div>
                </div>
              </CardContent>
            </AnimatedCard>

            <div className="flex justify-center">
              <ArrowBoldDown width="24" height="24" className="text-muted-foreground" />
            </div>

            {/* Step 3: AI Sends Response */}
            <AnimatedCard
              className="bg-card border border-border rounded-xl shadow-lg max-w-3xl mx-auto"
              delay={300}
            >
              <CardContent className="p-0">
                <div className="flex items-center gap-3 p-4 sm:p-6 bg-muted/50 rounded-t-xl">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-primary font-semibold">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">AI Agent Sends Response</h3>
                    <p className="text-sm text-muted-foreground">Using the Inbound API to send a personalized reply</p>
                  </div>
                </div>
                <div className="p-4 sm:p-6">
                  <Card className="bg-neutral-900 border-neutral-700 mb-4">
                    <CardContent className="p-4 font-mono text-sm">
                      <div className="text-pink-400">POST</div>
                      <div className="text-green-300">https://inbound.new/v2/send</div>
                      <div className="text-gray-400 mt-2">{`{`}</div>
                      <div className="ml-4 text-gray-300">
                        <div>to: <span className="text-green-300">"customer@example.com"</span>,</div>
                        <div>from: <span className="text-green-300">"support@youragent.ai"</span>,</div>
                        <div>subject: <span className="text-green-300">"Re: How do I integrate your API?"</span>,</div>
                        <div>replyTo: <span className="text-yellow-300">"message_id_123"</span></div>
                      </div>
                      <div className="text-gray-400">{`}`}</div>
                    </CardContent>
                  </Card>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm text-foreground mb-2">
                      Hi! Thanks for reaching out. Here's how to integrate our API:
                    </p>
                    <ol className="text-sm text-foreground list-decimal list-inside space-y-1">
                      <li>First, get your API key from the dashboard</li>
                      <li>Install our SDK: npm install @inbound/sdk</li>
                      <li>Initialize with your API key...</li>
                    </ol>
                  </div>
                  <Badge variant="secondary" className="bg-green-500/20 text-green-600 mt-4">
                    <ArrowUpRight2 width="12" height="12" className="mr-1" />
                    Email sent successfully
                  </Badge>
                </div>
              </CardContent>
            </AnimatedCard>
          </div>
        </AnimatedSection>

        {/* AI Agent Features */}
        <AnimatedSection className="px-4 sm:px-6 max-w-6xl mx-auto py-6 pb-7">
          <div className="text-center mb-6 xs:mb-8 sm:mb-12">
            <h2 className="text-2xl xs:text-3xl sm:text-4xl font-medium mb-2 xs:mb-3 sm:mb-4 text-foreground">
              Built for AI agent workflows
            </h2>
            <p className="text-muted-foreground text-xs xs:text-sm sm:text-base px-2 xs:px-4">
              Everything your AI agents need to handle email communication professionally
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 xs:gap-6 md:gap-8">
            {/* Email Sending */}
            <AnimatedCard
              className="relative bg-card rounded-xl xs:rounded-2xl p-4 xs:p-6 sm:p-8 text-center transition-all duration-300 z-20 shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-border"
              delay={100}
              direction="up"
            >
              <CardContent className="p-0">
                <div className="w-12 h-12 xs:w-16 xs:h-16 sm:w-20 sm:h-20 mx-auto mb-4 xs:mb-6 sm:mb-8 rounded-xl xs:rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                  <EnvelopePlus width="24" height="24" className="text-primary xs:w-8 xs:h-8" />
                </div>
                <h3 className="text-lg xs:text-xl sm:text-2xl font-semibold mb-2 xs:mb-3 sm:mb-4 text-foreground tracking-tight">
                  Email Sending
                </h3>
                <p className="text-muted-foreground mb-4 xs:mb-6 sm:mb-8 leading-relaxed text-xs xs:text-sm sm:text-base">
                  Send personalized emails from your AI agents with full threading support
                </p>
                <div className="text-left space-y-1.5 xs:space-y-2 text-xs xs:text-sm text-muted-foreground">
                  <div className="flex items-start gap-1.5 xs:gap-2">
                    <CircleCheck width="14" height="14" className="text-green-500 mt-0.5 flex-shrink-0 xs:w-4 xs:h-4" />
                    <span>Reply to threads automatically</span>
                  </div>
                  <div className="flex items-start gap-1.5 xs:gap-2">
                    <CircleCheck width="14" height="14" className="text-green-500 mt-0.5 flex-shrink-0 xs:w-4 xs:h-4" />
                    <span>Custom from addresses</span>
                  </div>
                  <div className="flex items-start gap-1.5 xs:gap-2">
                    <CircleCheck width="14" height="14" className="text-green-500 mt-0.5 flex-shrink-0 xs:w-4 xs:h-4" />
                    <span>HTML and plain text support</span>
                  </div>
                </div>
              </CardContent>
            </AnimatedCard>

            {/* Email Receiving */}
            <AnimatedCard
              className="relative bg-card rounded-2xl p-6 sm:p-8 text-center transition-all duration-300 z-20 shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-border"
              delay={200}
              direction="up"
            >
              <CardContent className="p-0">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 sm:mb-8 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                  <EnvelopeOpen width="32" height="32" className="text-primary" />
                </div>
                <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 text-foreground tracking-tight">
                  Email Receiving
                </h3>
                <p className="text-muted-foreground mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
                  Receive and process emails instantly with structured webhook data
                </p>
                <div className="text-left space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Real-time webhook delivery</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Full email parsing</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Attachment handling</span>
                  </div>
                </div>
              </CardContent>
            </AnimatedCard>

            {/* Agent Mailboxes */}
            <AnimatedCard
              className="relative bg-card rounded-2xl p-6 sm:p-8 text-center transition-all duration-300 z-20 shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-border"
              delay={300}
              direction="up"
            >
              <CardContent className="p-0">
                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 sm:mb-8 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                  <Folder2 width="32" height="32" className="text-primary" />
                </div>
                <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 text-foreground tracking-tight">
                  Agent Mailboxes
                </h3>
                <p className="text-muted-foreground mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
                  Dedicated mailboxes for each AI agent with conversation history
                </p>
                <div className="text-left space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Conversation threading</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Search and filter emails</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Email state management</span>
                  </div>
                </div>
              </CardContent>
            </AnimatedCard>
          </div>
        </AnimatedSection>

        {/* API v2 Section */}
        <AnimatedSection className="py-8 xs:py-12 sm:py-16 px-4 xs:px-6 sm:px-16 lg:px-32 w-full m-2 xs:m-4 sm:m-12 text-center bg-gradient-to-b from-muted/10 to-background rounded-[20px] xs:rounded-[30px] sm:rounded-[50px] my-8 xs:my-12 sm:my-20">
          <h2 className="text-2xl xs:text-3xl sm:text-4xl font-medium mb-3 xs:mb-4 sm:mb-6 text-foreground">
            Powerful API v2 for AI agents
          </h2>
          <p className="text-muted-foreground text-xs xs:text-base sm:text-lg mb-4 xs:mb-6 sm:mb-8 leading-relaxed px-2 xs:px-4 sm:px-16 lg:px-56">
            Our v2 API is designed specifically for AI agent workflows with enhanced features for autonomous email handling
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mt-8 sm:mt-12">
            {/* Send Email Example */}
            <AnimatedCard className="shadow-sm border border-border rounded-2xl bg-card" delay={100} direction="left">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <EnvelopePlus width="20" height="20" className="text-primary" />
                  <span className="font-semibold text-base sm:text-lg text-foreground">Send Email API</span>
                </div>
                <p className="text-muted-foreground mb-3 sm:mb-4 text-left text-sm sm:text-base">
                  Send emails from your AI agents with full control over content and threading
                </p>
                <Card className="bg-neutral-900 border-neutral-700">
                  <CardContent className="p-3 sm:p-4 text-left overflow-x-auto">
                    <code className="text-xs sm:text-sm font-mono block whitespace-nowrap">
                      <div className="text-pink-400">POST</div>
                      <div className="text-green-300">https://inbound.new/v2/send</div>
                      <br />
                      <div className="text-gray-400">{`{`}</div>
                      <div className="ml-4">
                        <div className="text-gray-300">"from": <span className="text-green-300">"agent@yourdomain.ai"</span>,</div>
                        <div className="text-gray-300">"to": <span className="text-green-300">"user@example.com"</span>,</div>
                        <div className="text-gray-300">"subject": <span className="text-green-300">"AI Response"</span>,</div>
                        <div className="text-gray-300">"body": <span className="text-green-300">"..."</span>,</div>
                        <div className="text-gray-300">"replyTo": <span className="text-yellow-300">"thread_id"</span></div>
                      </div>
                      <div className="text-gray-400">{`}`}</div>
                    </code>
                  </CardContent>
                </Card>
              </CardContent>
            </AnimatedCard>

            {/* Mailbox Query Example */}
            <AnimatedCard className="shadow-sm border border-border rounded-2xl bg-card" delay={200} direction="right">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <Folder2 width="20" height="20" className="text-primary" />
                  <span className="font-semibold text-base sm:text-lg text-foreground">Query Mailbox API</span>
                </div>
                <p className="text-muted-foreground mb-3 sm:mb-4 text-left text-sm sm:text-base">
                  Search and retrieve emails from agent mailboxes with powerful filtering
                </p>
                <Card className="bg-neutral-900 border-neutral-700">
                  <CardContent className="p-3 sm:p-4 text-left overflow-x-auto">
                    <code className="text-xs sm:text-sm font-mono block">
                      <div className="text-pink-400 inline">GET</div>{" "}
                      <div className="text-green-300 inline break-all">https://inbound.new/v2/mailbox/emails</div>
                      <br /><br />
                      <div className="text-gray-400">// Query parameters</div>
                      <div className="text-blue-400">?mailboxId=</div><span className="text-yellow-300">agent_123</span>
                      <br />
                      <div className="text-blue-400">&status=</div><span className="text-green-300">unread</span>
                      <br />
                      <div className="text-blue-400">&from=</div><span className="text-green-300">customer@*</span>
                    </code>
                  </CardContent>
                </Card>
              </CardContent>
            </AnimatedCard>
          </div>

          <div className="mt-8 sm:mt-12">
            <Button size="lg" asChild>
              <a href="/docs" target="_blank" rel="noopener noreferrer">
                Explore Full API Documentation
                <ArrowBoldRight width="16" height="16" className="ml-2" />
              </a>
            </Button>
          </div>
        </AnimatedSection>

        {/* Pricing */}
        <AnimatedSection className="px-2 xs:px-4 sm:px-6 w-full mx-auto bg-card rounded-xl xs:rounded-2xl border border-border my-8 xs:my-12 sm:my-20 py-8 xs:py-12 sm:py-20">
          <div className="text-center mb-6 xs:mb-8 sm:mb-12">
            <h2 className="text-2xl xs:text-3xl sm:text-4xl font-medium mb-2 xs:mb-3 sm:mb-4 text-foreground">
              Scale with your AI agents
            </h2>
            <p className="text-muted-foreground text-xs xs:text-sm sm:text-base px-2 xs:px-4">
              Start free and grow as your AI agent usage increases
            </p>
          </div>

          <div className="max-w-4xl mx-auto px-2 xs:px-0">
            <PricingTable />
          </div>
        </AnimatedSection>
      </div>

      {/* Footer */}
      <footer className="bg-background text-foreground py-6 xs:py-8 sm:py-12 tracking-tight w-full border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xs:gap-6 items-center justify-between">
            <div className="flex items-center gap-1.5 xs:gap-2 justify-center md:justify-start">
              <Image
                src="https://inbound.new/inbound-logo-3.png"
                alt="Inbound Logo"
                width={24}
                height={24}
                className="rounded-lg shadow-sm xs:w-7 xs:h-7 sm:w-8 sm:h-8"
              />
              <span className="font-semibold text-sm xs:text-base sm:text-lg text-foreground">inbound</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 xs:gap-4 sm:gap-6 text-[11px] xs:text-xs sm:text-sm text-muted-foreground justify-center md:justify-end">
              <a href="/docs" className="hover:text-foreground transition-colors">
                API Docs
              </a>
              <a href="https://discord.gg/NKD3qHzKE5" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                Discord
              </a>
              <a href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </a>
              <a href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </a>
              <a href="mailto:support@inbound.new" className="hover:text-foreground transition-colors">
                Support
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
} 