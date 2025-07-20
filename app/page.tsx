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
import CustomInboundIcon from "@/components/icons/customInbound"
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
import { MobileMenu } from "@/components/landing/MobileMenu"
import { VelocityScroll } from "@/components/magicui/scroll-based-velocity"
import { Ripple } from "@/components/magicui/ripple"
import { FlickeringGrid } from "@/components/magicui/flickering-grid"
import { AnimatedGridPattern } from "@/components/magicui/animated-grid-pattern"
import { RetroGrid } from "@/components/magicui/retro-grid"
import HeroVideoDialog from "@/components/magicui/hero-video-dialog"
import { headers } from "next/headers"
import Link from "next/link"

async function InboundHeroSection() {
  const session = await auth.api.getSession({ headers: await headers() })
  return (
    <AnimatedSection>
      {/* Header */}
      <header className="flex items-center justify-between py-3 sm:py-4 lg:py-6 w-full px-4 sm:px-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <Image
            src="https://inbound.new/inbound-logo-3.png"
            alt="Inbound Logo"
            width={24}
            height={24}
            className="rounded-lg shadow-sm sm:w-7 sm:h-7 lg:w-8 lg:h-8"
          />
          <span className="font-semibold text-xl sm:text-2xl lg:text-3xl text-foreground">inbound</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Desktop navigation */}
          <div className="hidden md:flex items-center gap-4 text-sm lg:text-base text-muted-foreground">
            <a href="/docs" className="hover:text-foreground transition-colors">docs</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">pricing</a>
            <a href="mailto:support@inbound.email" className="hover:text-foreground transition-colors">help</a>
          </div>
          { session?.user ? (
            <Button size="default" className="text-sm sm:text-base" asChild>
              <Link href="/mail">
                <span className="hidden sm:inline">hey {session.user.name.toLowerCase()} 👋</span>
                <span className="sm:hidden">dashboard</span>
              </Link>
            </Button>
          ) : (
            <Button size="default" className="text-sm sm:text-base" asChild>
              <Link href="/login">
                get started
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* Main content area - Hero image with overlaid text */}
      <div className="relative w-full">
        {/* Hero image as background */}
        <div className="rounded-t-[12px] sm:rounded-t-[20px] lg:rounded-t-[30px] border-t border-l border-r border-border overflow-hidden relative">
          <div className="relative min-h-[500px] sm:min-h-[600px] lg:min-h-[700px]">
            {/* Mobile image */}
            <Image
              src="/inbound-hero.png"
              alt="Inbound Email for AI Agents"
              width={1300}
              height={1920}
              className="lg:hidden w-[500px] h-[500px] object-cover brightness-75 animate-[scale-in_2s_ease-out_forwards] scale-110"
              priority
            />
            
            {/* Desktop image */}
            <Image
              src="/inbound-hero.png"
              alt="Inbound Email for AI Agents"
              width={1300}
              height={1920}
              className="hidden lg:block w-full h-full object-cover brightness-75 animate-[scale-in_2s_ease-out_forwards] scale-110"
              priority
            />

            {/* Mobile gradient overlay for better text readability */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/50 lg:bg-gradient-to-r lg:from-black/40 lg:via-black/20 lg:to-transparent" />

            {/* Bottom fade overlay */}
            <div className="absolute inset-x-0 bottom-0 h-[80px] sm:h-[100px] pointer-events-none bg-gradient-to-t from-background to-transparent" />

            {/* Fading border overlay for bottom */}
            <div className="absolute inset-x-0 bottom-0 h-[80px] sm:h-[100px] pointer-events-none">
              <div className="absolute left-0 bottom-0 w-px h-full bg-gradient-to-t from-transparent to-border"></div>
              <div className="absolute right-0 bottom-0 w-px h-full bg-gradient-to-t from-transparent to-border"></div>
            </div>

            {/* Overlaid content - responsive layout */}
            <div className="absolute inset-0 flex items-center">
              <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-12 items-center">
                {/* Left column - Text content */}
                <div className="space-y-4 sm:space-y-6 text-center sm:text-left">
                  <h1 className="text-5xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight">
                    email for<br />
                    ai agents
                  </h1>
                  <p className="text-white/90 text-sm sm:text-base lg:text-lg xl:text-xl leading-relaxed max-w-lg mx-auto lg:mx-0">
                    give your AI agents the power to send, receive, and manage emails programmatically with our simple API.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center lg:items-start gap-3 sm:gap-4 pt-2 sm:pt-4 justify-center lg:justify-start">
                    <Link href="/login">
                      <Button size="lg" className="w-full sm:w-auto min-w-[160px]">
                        get started now
                      </Button>
                    </Link>
                    <Link href="https://docs.inbound.new" target="_blank"> 
                      <Button variant="ghost" size="lg" className="w-full sm:w-auto min-w-[140px] bg-white/10 border-white/20 text-white hover:bg-white/20">
                        go to the docs →
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Right column - Video dialog */}
                <div className="hidden lg:flex justify-center items-center">
                  <HeroVideoDialog
                    className="max-w-2xl w-full"
                    animationStyle="from-center"
                    videoSrc="/inbound-hero-video.mp4"
                    thumbnailSrc="/inbound-hero.png"
                    thumbnailAlt="How to use Inbound - Email for AI Agents"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AnimatedSection>
  )
}

function ActualFeaturesSection() {
  return (
    <AnimatedSection className="px-4 sm:px-6 max-w-6xl mx-auto py-6 pb-7">
      <div className="text-center mb-6 xs:mb-8 sm:mb-12">
        <h2 className="text-2xl xs:text-3xl sm:text-4xl font-medium mb-2 xs:mb-3 sm:mb-4 text-foreground">built for AI agents</h2>
        <p className="text-muted-foreground text-xs xs:text-sm sm:text-base px-2 xs:px-4">
          Simple APIs that make email integration effortless for your AI applications
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 w-full overflow-hidden">
        {/* Email to Webhooks */}
        <AnimatedCard
          className="relative bg-card rounded-3xl p-8 sm:p-10 text-center transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 border border-border/50 overflow-hidden group"
          delay={100}
          direction="up"
        >
          {/* Ripple Background */}
          <div className="absolute inset-0">
            <Ripple
              mainCircleSize={200}
              mainCircleOpacity={0.08}
              numCircles={5}
            />
          </div>

          <CardContent className="p-0 relative z-10 flex flex-col items-center min-h-[280px]">
            {/* Centered Icon */}
            <div className="flex-1 flex items-center justify-center mb-6">
              <CustomInboundIcon
                size={80}
                Icon={BoltLightning}
                backgroundColor="#3b82f6"
              />
            </div>

            {/* Content */}
            <div className="space-y-4">
              <h3 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
                Email to Webhooks
              </h3>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-xs mx-auto">
                Instantly convert incoming emails into structured webhook payloads
              </p>

              {/* Features */}
              <div className="space-y-2 text-left max-w-xs mx-auto">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>Real-time delivery</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>Structured JSON</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>Full parsing</span>
                </div>
              </div>
            </div>
          </CardContent>
        </AnimatedCard>

        {/* SDK Control */}
        <AnimatedCard
          className="relative bg-card rounded-3xl p-8 sm:p-10 text-center transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 border border-border/50 overflow-hidden group"
          delay={200}
          direction="up"
        >
          {/* FlickeringGrid Background */}
          <div className="absolute inset-0">
            <FlickeringGrid
              className="absolute inset-0 z-0 [mask-image:radial-gradient(450px_circle_at_center,white,transparent)]"
              squareSize={4}
              gridGap={6}
              color="#10b981"
              maxOpacity={0.1}
              flickerChance={0.1}
              width={800}
              height={600}
            />
          </div>

          <CardContent className="p-0 relative z-10 flex flex-col items-center min-h-[280px]">
            {/* Centered Icon */}
            <div className="flex-1 flex items-center justify-center mb-6">
              <CustomInboundIcon
                size={80}
                Icon={Code2}
                backgroundColor="#10b981"
              />
            </div>

            {/* Content */}
            <div className="space-y-4">
              <h3 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
                SDK Control
              </h3>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-xs mx-auto">
                Full programmatic control over email sending and management
              </p>

              {/* Features */}
              <div className="space-y-2 text-left max-w-xs mx-auto">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>Send programmatically</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>Reply to messages</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>TypeScript SDK</span>
                </div>
              </div>
            </div>
          </CardContent>
        </AnimatedCard>

        {/* Domain Aggregation */}
        <AnimatedCard
          className="relative bg-card rounded-3xl p-8 sm:p-10 text-center transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 border border-border/50 overflow-hidden group"
          delay={300}
          direction="up"
        >
          {/* AnimatedGridPattern Background */}
          <AnimatedGridPattern
            className="absolute inset-0 z-0 [mask-image:radial-gradient(450px_circle_at_center,white,transparent)]"
            width={30}
            height={30}
            x={-1}
            y={-1}
            strokeDasharray={0}
            numSquares={50}
            maxOpacity={0.15}
            duration={3}
            repeatDelay={0.5}
          />

          <CardContent className="p-0 relative z-10 flex flex-col items-center min-h-[280px]">
            {/* Centered Icon */}
            <div className="flex-1 flex items-center justify-center mb-6">
              <CustomInboundIcon
                size={80}
                Icon={Globe2}
                backgroundColor="#8b5cf6"
              />
            </div>

            {/* Content */}
            <div className="space-y-4">
              <h3 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
                Domain Aggregation
              </h3>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-xs mx-auto">
                Route multiple domains to single endpoints for centralized processing
              </p>

              {/* Features */}
              <div className="space-y-2 text-left max-w-xs mx-auto">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>Multi-domain support</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>Unified routing</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>Domain-aware data</span>
                </div>
              </div>
            </div>
          </CardContent>
        </AnimatedCard>

        {/* Email Routing */}
        <AnimatedCard
          className="relative bg-card rounded-3xl p-8 sm:p-10 text-center transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 border border-border/50 overflow-hidden group"
          delay={400}
          direction="up"
        >
          {/* RetroGrid Background */}
          <div className="absolute inset-0">
            <RetroGrid
              className="absolute inset-0 z-0"
              angle={65}
              cellSize={60}
              opacity={0.1}
              lightLineColor="#f59e0b"
              darkLineColor="#f59e0b"
            />
          </div>

          <CardContent className="p-0 relative z-10 flex flex-col items-center min-h-[280px]">
            {/* Centered Icon */}
            <div className="flex-1 flex items-center justify-center mb-6">
              <CustomInboundIcon
                size={80}
                Icon={UserGroup}
                backgroundColor="#f59e0b"
              />
            </div>

            {/* Content */}
            <div className="space-y-4">
              <h3 className="text-xl sm:text-2xl font-semibold text-foreground tracking-tight">
                Email Routing
              </h3>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-xs mx-auto">
                Smart routing to distribution lists and multiple AI agents
              </p>

              {/* Features */}
              <div className="space-y-2 text-left max-w-xs mx-auto">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>Distribution lists</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>Rule-based forwarding</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CircleCheck width="16" height="16" className="text-green-500 flex-shrink-0" />
                  <span>Multi-agent coordination</span>
                </div>
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
      <div className="min-h-screen font-sans relative rounded-b-[20px] sm:rounded-b-[30px] lg:rounded-b-[50px] tracking-tight flex flex-col justify-center items-center px-2 sm:px-4 lg:px-6 xl:px-12">


        {/* Hero Section */}
        <InboundHeroSection />

        {/* Vendor Showcase */}
        <AnimatedSection className="py-6 sm:py-8 lg:py-12 xl:py-16 w-full overflow-hidden">
          <div className="text-center mb-4 sm:mb-6 lg:mb-8 xl:mb-12 px-4">
            <h2 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-medium mb-2 sm:mb-3 lg:mb-4 text-foreground">trusted by companies</h2>
            <p className="text-muted-foreground text-xs sm:text-sm lg:text-base">
              leading ai companies use inbound for their email infrastructure
            </p>
          </div>

          <div className="relative">
            <VelocityScroll
              defaultVelocity={0.2}
              numRows={2}
              className="text-lg font-medium text-muted-foreground/60 tracking-wide"
            >
              <span className="ml-2">nextdev.fm |</span>
              <span className="ml-2">agenda.dev |</span>
              <span className="ml-2">exon.dev |</span>

            </VelocityScroll>

            {/* Fade overlays */}
            <div className="absolute inset-y-0 left-0 w-12 sm:w-16 lg:w-24 xl:w-32 bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
            <div className="absolute inset-y-0 right-0 w-12 sm:w-16 lg:w-24 xl:w-32 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
          </div>
        </AnimatedSection>

        {/* How it works section */}
        <AnimatedSection className="px-4 sm:px-6 lg:px-8 bg-card w-full m-2 sm:m-4 lg:m-6 py-6 sm:py-8 lg:py-12 xl:py-20 z-1 rounded-[16px] sm:rounded-[20px] lg:rounded-[30px] xl:rounded-[50px]">
          <h2 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-medium text-center mb-4 sm:mb-6 lg:mb-8 xl:mb-12 text-foreground">how does it work?</h2>

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



        {/* AI Agent Examples Section */}
        <AnimatedSection className="py-8 xs:py-12 sm:py-16 px-4 xs:px-6 sm:px-16 lg:px-32 w-full m-2 xs:m-4 sm:m-12 text-center bg-gradient-to-b from-muted/10 to-background rounded-[20px] xs:rounded-[30px] sm:rounded-[50px] my-8 xs:my-12 sm:my-20">
          <h2 className="text-2xl xs:text-3xl sm:text-4xl font-medium mb-3 xs:mb-4 sm:mb-6 text-foreground">simple for AI agents</h2>
          <p className="text-muted-foreground text-xs xs:text-base sm:text-lg mb-4 xs:mb-6 sm:mb-8 leading-relaxed px-2 xs:px-4 sm:px-16 lg:px-56">
            Your AI agents can send, receive, and manage emails with just a few lines of code. No complex setup required.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mt-8 sm:mt-12">
            {/* Receiving Emails */}
            <AnimatedCard className="shadow-sm border border-border rounded-2xl bg-card" delay={100} direction="left">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <CustomInboundIcon
                    size={24}
                    Icon={Envelope2}
                    backgroundColor="#3b82f6"
                  />
                  <span className="font-semibold text-base sm:text-lg text-foreground">Receive Emails</span>
                </div>
                <p className="text-muted-foreground mb-3 sm:mb-4 text-left text-sm sm:text-base">
                  Set up a webhook endpoint and start receiving structured email data instantly.
                </p>
                <Card className="bg-neutral-900 border-neutral-700">
                  <CardContent className="p-3 sm:p-4 text-left overflow-x-auto">
                    <code className="text-xs sm:text-sm font-mono block">
                      <div className="text-gray-400">// Webhook payload structure</div>
                      <div className="text-white mt-2">{`{`}</div>
                      <div className="text-blue-400 ml-2">"from": <span className="text-green-300">"user@company.com"</span>,</div>
                      <div className="text-blue-400 ml-2">"to": <span className="text-green-300">"support@yourdomain.com"</span>,</div>
                      <div className="text-blue-400 ml-2">"subject": <span className="text-green-300">"Help request"</span>,</div>
                      <div className="text-blue-400 ml-2">"body": <span className="text-white">{`{`}</span></div>
                      <div className="text-blue-400 ml-4">"text": <span className="text-green-300">"Email content..."</span>,</div>
                      <div className="text-blue-400 ml-4">"html": <span className="text-green-300">"&lt;p&gt;Email content...&lt;/p&gt;"</span></div>
                      <div className="text-white ml-2">{`},`}</div>
                      <div className="text-blue-400 ml-2">"attachments": <span className="text-yellow-400">[...]</span></div>
                      <div className="text-white">{`}`}</div>
                    </code>
                  </CardContent>
                </Card>
                <div className="text-right mt-3 sm:mt-4">
                  <Button variant="ghost" asChild>
                    <a href="/docs" target="_blank" rel="noopener noreferrer">
                      Setup Webhooks →
                    </a>
                  </Button>
                </div>
              </CardContent>
            </AnimatedCard>

            {/* Sending Emails */}
            <AnimatedCard className="shadow-sm border border-border rounded-2xl bg-card" delay={200} direction="right">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <CustomInboundIcon
                    size={24}
                    Icon={Code2}
                    backgroundColor="#10b981"
                  />
                  <span className="font-semibold text-base sm:text-lg text-foreground">Send & Reply</span>
                </div>
                <p className="text-muted-foreground mb-3 sm:mb-4 text-left text-sm sm:text-base">
                  Your AI agents can send emails and reply to conversations programmatically.
                </p>
                <Card className="bg-neutral-900 border-neutral-700">
                  <CardContent className="p-3 sm:p-4 text-left overflow-x-auto">
                    <code className="text-xs sm:text-sm font-mono block">
                      <div><span className="text-blue-400">import</span> <span className="text-yellow-300">{`{ InboundClient }`}</span> <span className="text-blue-400">from</span> <span className="text-green-300">'@inbound/sdk'</span></div>
                      <div className="mt-2"><span className="text-blue-400">const</span> <span className="text-white">client</span> <span className="text-pink-400">=</span> <span className="text-blue-400">new</span> <span className="text-yellow-300">InboundClient</span><span className="text-white">(apiKey)</span></div>
                      <div className="mt-4 text-gray-400">// Send email</div>
                      <div className="mt-2"><span className="text-blue-400">await</span> <span className="text-white">client.emails.</span><span className="text-yellow-300">send</span><span className="text-white">({`{`}</span></div>
                      <div className="text-blue-400 ml-2">from: <span className="text-green-300">'agent@yourdomain.com'</span>,</div>
                      <div className="text-blue-400 ml-2">to: <span className="text-green-300">'user@company.com'</span>,</div>
                      <div className="text-blue-400 ml-2">subject: <span className="text-green-300">'AI Response'</span>,</div>
                      <div className="text-blue-400 ml-2">body: <span className="text-green-300">'Here is your answer...'</span></div>
                      <div className="text-white">{`})`}</div>
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
