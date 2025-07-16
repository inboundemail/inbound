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


function ActualFeaturesSection() {
  return (
    <AnimatedSection className="px-4 sm:px-6 max-w-6xl mx-auto py-6 pb-7">
      <div className="text-center mb-6 xs:mb-8 sm:mb-12">
        <h2 className="text-2xl xs:text-3xl sm:text-4xl font-medium mb-2 xs:mb-3 sm:mb-4 text-foreground">core features</h2>
        <p className="text-muted-foreground text-xs xs:text-sm sm:text-base px-2 xs:px-4">
          Everything you need to manage email infrastructure programmatically
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 xs:gap-6 md:gap-8">
        {/* Email Receiving */}
        <AnimatedCard
          className="relative bg-card rounded-xl xs:rounded-2xl p-4 xs:p-6 sm:p-8 text-center transition-all duration-300 z-20 shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-border"
          delay={100}
          direction="up"
        >
          <CardContent className="p-0">
            <div className="w-12 h-12 xs:w-16 xs:h-16 sm:w-20 sm:h-20 mx-auto mb-4 xs:mb-6 sm:mb-8 rounded-xl xs:rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
              <Envelope2 width="24" height="24" className="text-primary xs:w-8 xs:h-8" />
            </div>
            <h3 className="text-lg xs:text-xl sm:text-2xl font-semibold mb-2 xs:mb-3 sm:mb-4 text-foreground tracking-tight">
              Email Receiving
            </h3>
            <p className="text-muted-foreground mb-4 xs:mb-6 sm:mb-8 leading-relaxed text-xs xs:text-sm sm:text-base">
              Receive emails on unlimited addresses across your domains with automatic processing
            </p>
            <div className="text-left space-y-1.5 xs:space-y-2 text-xs xs:text-sm text-muted-foreground">
              <div className="flex items-start gap-1.5 xs:gap-2">
                <CircleCheck width="14" height="14" className="text-green-500 mt-0.5 flex-shrink-0 xs:w-4 xs:h-4" />
                <span>AWS SES integration for reliable delivery</span>
              </div>
              <div className="flex items-start gap-1.5 xs:gap-2">
                <CircleCheck width="14" height="14" className="text-green-500 mt-0.5 flex-shrink-0 xs:w-4 xs:h-4" />
                <span>Spam and virus filtering built-in</span>
              </div>
              <div className="flex items-start gap-1.5 xs:gap-2">
                <CircleCheck width="14" height="14" className="text-green-500 mt-0.5 flex-shrink-0 xs:w-4 xs:h-4" />
                <span>Full email parsing with attachments</span>
              </div>
            </div>
          </CardContent>
        </AnimatedCard>

        {/* Webhook Endpoints */}
        <AnimatedCard
          className="relative bg-card rounded-2xl p-6 sm:p-8 text-center transition-all duration-300 z-20 shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-border"
          delay={200}
          direction="up"
        >
          <CardContent className="p-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 sm:mb-8 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
              <BoltLightning width="32" height="32" className="text-primary" />
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 text-foreground tracking-tight">
              Webhook Endpoints
            </h3>
            <p className="text-muted-foreground mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
              Route emails to your API endpoints with guaranteed delivery and retries
            </p>
            <div className="text-left space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Real-time webhook delivery</span>
              </div>
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Automatic retries with backoff</span>
              </div>
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Delivery status tracking</span>
              </div>
            </div>
          </CardContent>
        </AnimatedCard>

        {/* Email Forwarding */}
        <AnimatedCard
          className="relative bg-card rounded-2xl p-6 sm:p-8 text-center transition-all duration-300 z-20 shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-border"
          delay={300}
          direction="up"
        >
          <CardContent className="p-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 sm:mb-8 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
              <UserGroup width="32" height="32" className="text-primary" />
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 text-foreground tracking-tight">
              Email Forwarding
            </h3>
            <p className="text-muted-foreground mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
              Forward emails to single addresses or groups with flexible routing rules
            </p>
            <div className="text-left space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Single and group forwarding</span>
              </div>
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Catch-all domain routing</span>
              </div>
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Custom routing rules</span>
              </div>
            </div>
          </CardContent>
        </AnimatedCard>

        {/* Analytics & Logs */}
        <AnimatedCard
          className="relative bg-card rounded-2xl p-6 sm:p-8 text-center transition-all duration-300 z-20 shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-border"
          delay={400}
          direction="up"
        >
          <CardContent className="p-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 sm:mb-8 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
              <ChartActivity2 width="32" height="32" className="text-primary" />
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 text-foreground tracking-tight">
              Analytics & Logs
            </h3>
            <p className="text-muted-foreground mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
              Monitor email flow, delivery status, and system performance in real-time
            </p>
            <div className="text-left space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Detailed delivery logs</span>
              </div>
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Performance metrics</span>
              </div>
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Error tracking & debugging</span>
              </div>
            </div>
          </CardContent>
        </AnimatedCard>

        {/* API & SDK */}
        <AnimatedCard
          className="relative bg-card rounded-2xl p-6 sm:p-8 text-center transition-all duration-300 z-20 shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-border"
          delay={500}
          direction="up"
        >
          <CardContent className="p-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 sm:mb-8 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
              <Code2 width="32" height="32" className="text-primary" />
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 text-foreground tracking-tight">
              Developer Tools
            </h3>
            <p className="text-muted-foreground mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
              Full-featured REST API and TypeScript SDK for seamless integration
            </p>
            <div className="text-left space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>RESTful API with OpenAPI spec</span>
              </div>
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>TypeScript SDK with full types</span>
              </div>
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>API key authentication</span>
              </div>
            </div>
          </CardContent>
        </AnimatedCard>

        {/* Admin Controls */}
        <AnimatedCard
          className="relative bg-card rounded-2xl p-6 sm:p-8 text-center transition-all duration-300 z-20 shadow-sm hover:shadow-md hover:-translate-y-0.5 border border-border"
          delay={600}
          direction="up"
        >
          <CardContent className="p-0">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 sm:mb-8 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
              <Shield2 width="32" height="32" className="text-primary" />
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 text-foreground tracking-tight">
              Admin Controls
            </h3>
            <p className="text-muted-foreground mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
              Manage users, monitor AWS resources, and control system settings
            </p>
            <div className="text-left space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>User management dashboard</span>
              </div>
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>AWS SES monitoring</span>
              </div>
              <div className="flex items-start gap-2">
                <CircleCheck width="16" height="16" className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Lambda function logs</span>
              </div>
            </div>
          </CardContent>
        </AnimatedCard>
      </div>
    </AnimatedSection>
  )
}

export default async function HomePage() {

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
                <a
                  href="https://github.com/R44VC0RP/inbound"
                  className="hidden sm:flex items-center gap-1 bg-muted rounded-full text-muted-foreground hover:bg-muted/80 transition-colors cursor-pointer text-sm px-3 py-1.5"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  880
                </a>
              </div>
              <div className="flex items-center gap-2 sm:gap-4">
                {/* Mobile menu component */}
                <MobileMenu />

                {/* Desktop navigation */}
                <div className="hidden md:flex items-center gap-4">
                  <Button
                    variant="secondary"
                    asChild
                  >
                    <a href="https://discord.gg/NKD3qHzKE5" target="_blank" rel="noopener noreferrer">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                      </svg>
                      Discord
                    </a>
                  </Button>
                  {isLoggedIn ? (
                    <Button asChild>
                      <a href="/mail">Go to inbound</a>
                    </Button>
                  ) : (
                    <Button asChild>
                      <a href="/login">Sign In</a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </header>
        </AnimatedSection>

        {/* Hero Section - Client Component for typing effect */}
        <HeroSection />

        {/* Hero Image Section - Half above fold, half below */}
        <div className="relative w-full flex justify-center -mt-8 xs:-mt-16 sm:-mt-44 mb-2 xs:mb-4 z-10 opacity-0 animate-[fadeIn_1s_ease-out_1.5s_forwards] px-2 xs:px-4 sm:px-0">
          <div className="w-full max-w-5xl">
            {/* Mobile Image - visible on small screens */}
            <Image
              src="/inboundheromobile.svg"
              alt="Inbound Email Flow Illustration"
              width={400}
              height={300}
              className="w-full h-auto md:hidden"
              priority
            />
            {/* Desktop Image - visible on medium screens and up */}
            <Image
              src="/inboundhero.svg"
              alt="Inbound Email Flow Illustration"
              width={800}
              height={600}
              className="w-full h-auto hidden md:block"
              priority
            />
          </div>
        </div>

        {/* How it works section */}
        <AnimatedSection className="px-2 xs:px-4 sm:px-6 bg-card w-full m-1 xs:m-2 sm:m-4 py-8 xs:py-12 sm:py-20 z-1 rounded-[20px] xs:rounded-[30px] sm:rounded-[50px]">
          <h2 className="text-2xl xs:text-3xl sm:text-4xl font-medium text-center mb-6 xs:mb-8 sm:mb-12 text-foreground">how does it work?</h2>

          <div className="space-y-4 xs:space-y-6 sm:space-y-8">
            {/* Email Addresses Dashboard */}
            <AnimatedCard
              className="bg-card border border-border rounded-lg xs:rounded-xl shadow-lg max-w-3xl mx-auto transform -rotate-1"
              delay={50}
            >
              <CardContent className="p-0">
                {/* Dashboard Header */}
                <div className="flex items-center justify-between p-3 xs:p-4 sm:p-6 border-b border-border">
                  <div className="flex items-center gap-1.5 xs:gap-2 sm:gap-3">
                    <div className="w-6 h-6 xs:w-8 xs:h-8 sm:w-10 sm:h-10 bg-primary rounded-full flex items-center justify-center">
                      <Globe2 width="14" height="14" className="text-primary-foreground xs:w-4 xs:h-4 sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm xs:text-base sm:text-lg text-foreground">Email Addresses</h3>
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full"></div>
                        <span className="text-[10px] xs:text-xs sm:text-sm text-green-600">Domain verified</span>
                      </div>
                    </div>
                  </div>
                  <Gear2 width="16" height="16" className="text-muted-foreground xs:w-5 xs:h-5" />
                </div>

                {/* Email Addresses List */}
                <div className="p-3 xs:p-4 sm:p-6 space-y-2 xs:space-y-3 sm:space-y-4">
                  {/* Catch-all Address */}
                  <div className="flex items-center gap-1.5 xs:gap-2 sm:gap-4 text-[10px] xs:text-xs sm:text-sm">
                    <div className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                    <div className="font-semibold text-foreground w-4 xs:w-8 sm:w-16 flex-shrink-0">*</div>
                    <div className="text-muted-foreground hidden xs:block">@example.com</div>
                    <div className="text-muted-foreground text-[9px] xs:text-[10px] sm:text-xs font-normal ml-1 xs:ml-2 sm:ml-8 hidden sm:block">
                      ROUTES TO
                    </div>
                    <div className="flex-1 font-normal text-muted-foreground truncate flex items-center gap-1 xs:gap-2">
                      <BoltLightning width="10" height="10" className="text-primary xs:w-3 xs:h-3" />
                      <span className="truncate">webhook-endpoint</span>
                    </div>
                    <button className="w-4 h-4 xs:w-5 xs:h-5 sm:w-6 sm:h-6 bg-muted rounded-full flex items-center justify-center hover:bg-muted/80 transition-colors flex-shrink-0">
                      <TabClose width="10" height="10" className="text-muted-foreground xs:w-3 xs:h-3" />
                    </button>
                  </div>

                  {/* Individual Email Addresses */}
                  {[
                    { name: "support", endpoint: "support-webhook", type: "webhook" },
                    { name: "help", endpoint: "help@team.com", type: "email" },
                    { name: "sales", endpoint: "sales-group", type: "group" },
                    { name: "info", endpoint: "store-only", type: "store" },
                  ].map((address, index) => (
                    <div key={index} className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                      <div className="font-normal text-foreground w-12 sm:w-16 flex-shrink-0 truncate">
                        {address.name}
                      </div>
                      <div className="text-muted-foreground hidden sm:block">@example.com</div>
                      <div className="text-muted-foreground text-[10px] sm:text-xs font-normal ml-2 sm:ml-8 hidden sm:block">
                        ROUTES TO
                      </div>
                      <div className="flex-1 font-normal text-muted-foreground truncate flex items-center gap-2">
                        {address.type === 'webhook' && <BoltLightning width="12" height="12" className="text-primary" />}
                        {address.type === 'email' && <Envelope2 width="12" height="12" className="text-blue-500" />}
                        {address.type === 'group' && <UserGroup width="12" height="12" className="text-green-500" />}
                        {address.type === 'store' && <Database2 width="12" height="12" className="text-orange-500" />}
                        {address.endpoint}
                      </div>
                      <button className="w-5 h-5 sm:w-6 sm:h-6 bg-muted rounded-full flex items-center justify-center hover:bg-muted/80 transition-colors flex-shrink-0">
                        <TabClose width="12" height="12" className="text-muted-foreground" />
                      </button>
                    </div>
                  ))}

                  {/* Add New Email Address */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 border-t p-3 sm:p-4 pl-0 bg-muted/50 border-border">
                    <div className="flex items-center gap-2 sm:gap-4 flex-1">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 flex-shrink-0"></div>
                      <input
                        type="text"
                        placeholder="new-address"
                        className="font-normal text-foreground w-16 sm:w-20 border-0 border-b border-border focus:border-primary focus:outline-none bg-transparent text-xs sm:text-sm placeholder:text-muted-foreground"
                      />
                      <div className="text-muted-foreground text-xs sm:text-sm">@example.com</div>
                      <div className="text-muted-foreground text-[10px] sm:text-xs font-normal ml-2 sm:ml-8 hidden sm:block">
                        ROUTES TO
                      </div>
                      <div className="flex-1 text-muted-foreground text-xs sm:text-sm truncate hidden sm:block">
                        Select endpoint...
                      </div>
                    </div>
                    <Button size="sm">
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </AnimatedCard>

            <div className="flex justify-center">
              <ArrowBoldDown width="20" height="20" className="sm:w-6 sm:h-6 text-muted-foreground" />
            </div>

            {/* Email Received */}
            <AnimatedCard
              className="bg-card border border-border rounded-xl shadow-lg max-w-2xl mx-auto transform rotate-1"
              delay={100}
            >
              <CardContent className="p-0">
                {/* Email Header */}
                <div className="flex items-center gap-2 p-3 sm:p-4 rounded-tl-xl rounded-tr-xl bg-muted/50">
                  <Envelope2 width="16" height="16" className="text-muted-foreground" />
                  <span className="text-xs sm:text-sm text-muted-foreground">Incoming Email</span>
                </div>

                {/* Email Details */}
                <div className="p-4 sm:p-6 space-y-2 sm:space-y-3">
                  <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                    <span className="text-muted-foreground w-16 flex-shrink-0">From:</span>
                    <span className="text-foreground truncate">user@company.com</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                    <span className="text-muted-foreground w-16 flex-shrink-0">To:</span>
                    <span className="text-foreground truncate">support@example.com</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                    <span className="text-muted-foreground w-16 flex-shrink-0">Subject:</span>
                    <span className="text-foreground truncate">Need help with integration</span>
                  </div>
                  <div className="border-t border-border pt-3 sm:pt-4">
                    <div className="text-xs sm:text-sm text-foreground leading-relaxed">
                      <p>Hi support team,</p>
                      <p className="mt-2">
                        I'm trying to integrate your email API but running into some issues. 
                        Can you help me understand how to set up webhooks properly?
                      </p>
                      <p className="mt-2">
                        Thanks,<br />
                        John
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-3 sm:pt-4 border-t border-border">
                    <Badge variant="secondary" className="bg-green-500/20 text-green-600 border-green-500/20">
                      <CircleCheck width="12" height="12" className="mr-1" />
                      Received
                    </Badge>
                    <Badge variant="secondary" className="bg-blue-500/20 text-blue-600 border-blue-500/20">
                      <BoltLightning width="12" height="12" className="mr-1" />
                      Routing to webhook
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </AnimatedCard>

            <div className="flex justify-center">
              <ArrowBoldDown width="20" height="20" className="sm:w-6 sm:h-6 text-muted-foreground" />
            </div>

            {/* Webhook Delivery */}
            <AnimatedCard
              className="bg-neutral-900 rounded-xl shadow-lg max-w-2xl mx-auto transform -rotate-1"
              delay={200}
            >
              <CardContent className="p-4 sm:p-6 text-white">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <BoltLightning width="16" height="16" className="text-primary" />
                  <span className="text-xs sm:text-sm text-gray-400">Webhook Delivery</span>
                </div>
                <div className="font-mono text-xs sm:text-sm space-y-1">
                  <div className="text-green-400 break-all">POST https://your-api.com/webhooks/email</div>
                  <div className="text-blue-400">Headers: Authorization: Bearer ****</div>
                  <div className="text-yellow-400">Status: 200 OK</div>
                  <div className="text-gray-400 mt-2">Response time: 234ms</div>
                </div>
              </CardContent>
            </AnimatedCard>

            <div className="flex justify-center">
              <ArrowBoldDown width="20" height="20" className="sm:w-6 sm:h-6 text-muted-foreground" />
            </div>

            {/* Email Data Structure */}
            <AnimatedCard
              className="bg-neutral-900 rounded-xl shadow-lg max-w-3xl mx-auto transform rotate-1"
              delay={300}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <Database2 width="16" height="16" className="text-primary" />
                  <span className="font-semibold text-neutral-200 text-sm sm:text-base">Structured Email Data</span>
                </div>
                <Card className="bg-neutral-800 border-neutral-700">
                  <CardContent className="p-3 sm:p-4 font-mono text-xs sm:text-sm overflow-x-auto">
                    <div className="text-neutral-200 font-semibold">Webhook Payload</div>
                    <div className="mt-2">
                      <div className="space-y-1">
                        <div>
                          <span className="text-neutral-300">"from":</span>{" "}
                          <span className="text-green-400">"user@company.com"</span>,
                        </div>
                        <div>
                          <span className="text-neutral-300">"to":</span>{" "}
                          <span className="text-green-400">"support@example.com"</span>,
                        </div>
                        <div>
                          <span className="text-neutral-300">"subject":</span>{" "}
                          <span className="text-green-400">"Need help with integration"</span>,
                        </div>
                        <div>
                          <span className="text-neutral-300">"headers":</span> {`{ ... },`}
                        </div>
                        <div>
                          <span className="text-neutral-300">"body":</span> {`{`}
                        </div>
                        <div className="ml-2 sm:ml-4">
                          <span className="text-neutral-300">"text":</span>{" "}
                          <span className="text-green-400">"Hi support team..."</span>,
                        </div>
                        <div className="ml-2 sm:ml-4">
                          <span className="text-neutral-300">"html":</span>{" "}
                          <span className="text-green-400">"&lt;p&gt;Hi support team...&lt;/p&gt;"</span>
                        </div>
                        <div>{`},`}</div>
                        <div>
                          <span className="text-neutral-300">"attachments":</span>{" "}
                          <span className="text-yellow-400">[]</span>,
                        </div>
                        <div>
                          <span className="text-neutral-300">"timestamp":</span>{" "}
                          <span className="text-blue-400">"2024-01-15T10:30:00Z"</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </AnimatedCard>
          </div>
        </AnimatedSection>

        {/* Features Section */}
        <ActualFeaturesSection />

        {/* Developer Tools Section */}
        <AnimatedSection className="py-8 xs:py-12 sm:py-16 px-4 xs:px-6 sm:px-16 lg:px-32 w-full m-2 xs:m-4 sm:m-12 text-center bg-gradient-to-b from-muted/10 to-background rounded-[20px] xs:rounded-[30px] sm:rounded-[50px] my-8 xs:my-12 sm:my-20">
          <h2 className="text-2xl xs:text-3xl sm:text-4xl font-medium mb-3 xs:mb-4 sm:mb-6 text-foreground">built for developers</h2>
          <p className="text-muted-foreground text-xs xs:text-base sm:text-lg mb-4 xs:mb-6 sm:mb-8 leading-relaxed px-2 xs:px-4 sm:px-16 lg:px-56">
            Complete programmatic control with TypeScript SDK and REST API. Build email-driven applications with confidence.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mt-8 sm:mt-12">
            {/* TypeScript SDK */}
            <AnimatedCard className="shadow-sm border border-border rounded-2xl bg-card" delay={100} direction="left">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <Code2 width="20" height="20" className="text-primary" />
                  <span className="font-semibold text-base sm:text-lg text-foreground">TypeScript SDK</span>
                </div>
                <p className="text-muted-foreground mb-3 sm:mb-4 text-left text-sm sm:text-base">
                  Full type safety with our TypeScript SDK. Create email addresses and manage webhooks programmatically.
                </p>
                <Card className="bg-neutral-900 border-neutral-700">
                  <CardContent className="p-3 sm:p-4 text-left overflow-x-auto">
                    <code className="text-xs sm:text-sm font-mono block whitespace-nowrap">
                      <div className="text-green-400">npm install @inbound/sdk</div>
                      <div className="text-blue-400 mt-2 inline">import</div>{" "}
                      <div className="text-yellow-300 inline">{"{ InboundClient }"}</div>{" "}
                      <div className="text-blue-400 inline">from</div>{" "}
                      <div className="text-green-300 inline">'@inbound/sdk'</div>
                      <br />
                      <br />
                      <div className="text-blue-400 inline">const</div> <div className="text-white inline">client</div>{" "}
                      <div className="text-pink-400 inline">=</div>{" "}
                      <div className="text-blue-400 inline">new</div>{" "}
                      <div className="text-yellow-300 inline">InboundClient</div>
                      <div className="text-white inline">(apiKey)</div>
                    </code>
                  </CardContent>
                </Card>
                <div className="text-right mt-3 sm:mt-4">
                  <Button variant="ghost" asChild>
                    <a href="/docs" target="_blank" rel="noopener noreferrer">
                      View SDK Docs →
                    </a>
                  </Button>
                </div>
              </CardContent>
            </AnimatedCard>

            {/* REST API */}
            <AnimatedCard className="shadow-sm border border-border rounded-2xl bg-card" delay={200} direction="right">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <Globe2 width="20" height="20" className="text-primary" />
                  <span className="font-semibold text-base sm:text-lg text-foreground">REST API</span>
                </div>
                <p className="text-muted-foreground mb-3 sm:mb-4 text-left text-sm sm:text-base">
                  RESTful API with OpenAPI specification. Integrate email receiving from any language or platform.
                </p>
                <Card className="bg-neutral-900 border-neutral-700">
                  <CardContent className="p-3 sm:p-4 text-left overflow-x-auto">
                    <code className="text-xs sm:text-sm font-mono block">
                      <div className="text-pink-400 inline">curl</div> <div className="text-blue-400 inline">-X</div>{" "}
                      <div className="text-green-300 inline">POST</div> <div className="text-white inline">\</div>
                      <br />
                      <div className="text-green-300 inline break-all">https://api.inbound.email/v2/domains</div>{" "}
                      <div className="text-white inline">\</div>
                      <br />
                      <div className="text-blue-400 inline">-H</div>{" "}
                      <div className="text-green-300 inline break-all">"Authorization: Bearer YOUR_API_KEY"</div>{" "}
                      <div className="text-white inline">\</div>
                      <br />
                      <div className="text-blue-400 inline">-H</div>{" "}
                      <div className="text-green-300 inline break-all">"Content-Type: application/json"</div>
                    </code>
                  </CardContent>
                </Card>
                <div className="text-right mt-3 sm:mt-4">
                  <Button variant="ghost" asChild>
                    <a href="/docs" target="_blank" rel="noopener noreferrer">
                      View API Docs →
                    </a>
                  </Button>
                </div>
              </CardContent>
            </AnimatedCard>
          </div>


        </AnimatedSection>

        {/* Pricing */}
        <AnimatedSection className="px-2 xs:px-4 sm:px-6 w-full mx-auto bg-card rounded-xl xs:rounded-2xl border border-border my-8 xs:my-12 sm:my-20 py-8 xs:py-12 sm:py-20">
          <div className="text-center mb-6 xs:mb-8 sm:mb-12">
            <h2 className="text-2xl xs:text-3xl sm:text-4xl font-medium mb-2 xs:mb-3 sm:mb-4 text-foreground">simple pricing</h2>
            <p className="text-muted-foreground text-xs xs:text-sm sm:text-base px-2 xs:px-4">
              Start free and scale as you grow. No hidden fees, no surprises.
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
              <a href="https://twitter.com/inbound_email" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                Contact us on 𝕏
              </a>
              <a href="https://discord.gg/NKD3qHzKE5" target="_blank" rel="noopener noreferrer" className="flex gap-1 sm:gap-2 items-center hover:text-foreground transition-colors">
                Discord{" "}
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </a>
              <a href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </a>
              <a href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </a>
              <a href="/docs" className="hover:text-foreground transition-colors hidden sm:inline">
                Docs
              </a>
              <a href="mailto:support@inbound.email" className="hover:text-foreground transition-colors">
                Support
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
