"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowDown, ArrowRight, Menu } from "lucide-react"
import { useState } from "react"
import { useTypingEffect } from "@/hooks/useTypingEffect"
import { AnimatedCard } from "@/components/AnimatedCard"
import { AnimatedSection } from "@/components/AnimatedSection"
import SplitLayoutCard from "@/components/SplitLayoutCard"
import Image from "next/image"
import { PricingTable } from "@/components/autumn/pricing-table"

function EmailSetupFlow() {
  const [activeStep, setActiveStep] = useState(1)

  const handleStepClick = (stepNumber: number) => {
    if (stepNumber === 1) {
      console.log(`Starting step ${stepNumber}`)
    } else {
      console.log(`Step ${stepNumber} will be available after completing previous steps`)
    }
  }

  return (
    <AnimatedSection className="px-4 sm:px-6 max-w-6xl mx-auto py-6 pb-7">
      <div className="relative">
        {/* Flow connector line - hidden on mobile */}
        <div className="absolute top-[70px] left-[30%] right-[30%] h-0.5 bg-gray-200 z-0 hidden lg:block">
          <div className="absolute z-0 left-0 top-0 h-full w-0 bg-black animate-progressLine"></div>
        </div>

        <div className="grid z-1 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 lg:gap-10">
          {/* Step 1 - Active */}
          <AnimatedCard
            className="relative bg-white rounded-2xl p-6 sm:p-8 lg:p-12 text-center transition-all duration-300 cursor-pointer z-20 shadow-sm hover:shadow-md hover:-translate-y-0.5 border-black border-0"
            delay={100}
            direction="up"
            onClick={() => handleStepClick(1)}
          >
            <CardContent className="p-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 sm:mb-8 rounded-2xl bg-[#6C47FF]/10 border-2 border-[#6C47FF]/20 flex items-center justify-center transition-all duration-300 border-transparent bg-neutral-100">
                <div className="w-9 h-9 sm:w-11 sm:h-11 bg-[#6C47FF] rounded-full flex items-center justify-center text-white font-bold text-lg sm:text-xl bg-black">
                  1
                </div>
              </div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 text-gray-900 tracking-tight">
                Connect domains
              </h3>
              <p className="text-gray-600 mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
                List, verify, and manage your email domains programmatically
              </p>
              <Button asChild>
                <a href="/add">
                  Connect your domain
                </a>
              </Button>
              <div className="absolute -bottom-8 sm:-bottom-11 left-1/2 transform -translate-x-1/2 bg-[#6C47FF]/10 text-[#6C47FF] text-xs sm:text-sm font-medium px-2 sm:px-3 py-1 rounded-lg whitespace-nowrap">
                Takes 2 minutes
              </div>
            </CardContent>
          </AnimatedCard>

          {/* Step 2 - Upcoming */}
          <AnimatedCard
            className="relative bg-white rounded-2xl p-6 sm:p-8 lg:p-12 text-center transition-all duration-300 cursor-pointer z-20 border-2 border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-gray-200"
            delay={200}
            direction="up"
            onClick={() => handleStepClick(2)}
          >
            <CardContent className="p-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 sm:mb-8 rounded-2xl bg-gray-50 border-2 border-gray-100 flex items-center justify-center transition-all duration-300">
                <div className="w-9 h-9 sm:w-11 sm:h-11 bg-gray-400 rounded-full flex items-center justify-center text-white font-bold text-lg sm:text-xl">
                  2
                </div>
              </div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 text-gray-700 tracking-tight">
                Create emails
              </h3>
              <p className="text-gray-500 mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
                Unlimited email addresses on your connected domains with one click.
              </p>
              <Button
                variant="secondary"
                asChild
              >
                <a href="/emails">
                  Create addresses
                </a>
              </Button>
            </CardContent>
          </AnimatedCard>

          {/* Step 3 - Upcoming */}
          <AnimatedCard
            className="relative bg-white rounded-2xl p-6 sm:p-8 lg:p-12 text-center transition-all duration-300 cursor-pointer z-20 border-2 border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-gray-200 md:col-span-2 lg:col-span-1"
            delay={300}
            direction="up"
            onClick={() => handleStepClick(3)}
          >
            <CardContent className="p-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 sm:mb-8 rounded-2xl bg-gray-50 border-2 border-gray-100 flex items-center justify-center transition-all duration-300">
                <div className="w-9 h-9 sm:w-11 sm:h-11 bg-gray-400 rounded-full flex items-center justify-center text-white font-bold text-lg sm:text-xl">
                  3
                </div>
              </div>
              <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 text-gray-700 tracking-tight">
                Setup automations
              </h3>
              <p className="text-gray-500 mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
                Set up webhook endpoints that take action on real-time inbound emails.
              </p>
              <Button
                variant="secondary"
                asChild
              >
                <a href="/webhooks">
                  Setup webhooks
                </a>
              </Button>
            </CardContent>
          </AnimatedCard>
        </div>
      </div>
    </AnimatedSection>
  )
}

export default function HomePage() {
  const [inputValue, setInputValue] = useState("")
  const [isTypingComplete, setIsTypingComplete] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { displayText, isComplete } = useTypingEffect(["yourdomain.com"], 150)

  return (
    <div>
      <div className="min-h-screen bg-white font-sans relative rounded-b-[30px] sm:rounded-b-[50px] tracking-tight flex flex-col justify-center items-center px-4 sm:px-6 md:px-12">
        {/* Header */}
        <AnimatedSection direction="down" className="w-full">
          <header className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-6 bg-white w-full">
            <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3">
                <Image
                  src="https://inbound.new/inbound-logo-3.png"
                  alt="Inbound Logo"
                  width={28}
                  height={28}
                  className="rounded-lg shadow-sm sm:w-8 sm:h-8"
                />
                <span className="font-semibold text-base sm:text-lg">inbound</span>
                <a
                  href="https://github.com/yourusername/inbound"
                  className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer text-sm px-3 py-1.5"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  880
                </a>
              </div>
              <div className="flex items-center gap-2 sm:gap-4">
                {/* Mobile menu button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  <Menu className="w-4 h-4" />
                </Button>

                {/* Desktop navigation */}
                <div className="hidden md:flex items-center gap-4">
                  <Button
                    variant="secondary"
                    asChild
                  >
                    <a href="https://discord.gg/your-discord-server" target="_blank" rel="noopener noreferrer">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                      </svg>
                      Discord
                    </a>
                  </Button>
                  <Button asChild>
                    <a href="/login">
                      Sign Up
                    </a>
                  </Button>
                </div>
              </div>
            </div>

            {/* Mobile menu */}
            {mobileMenuOpen && (
              <div className="absolute top-full left-0 right-0 bg-white border-t border-gray-200 md:hidden z-50">
                <div className="px-4 py-4 space-y-3">
                  <Button
                    variant="secondary"
                    asChild
                  >
                    <a href="https://discord.gg/your-discord-server" target="_blank" rel="noopener noreferrer">
                      <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                      </svg>
                      Discord
                    </a>
                  </Button>
                  <Button asChild>
                    <a href="/login">Sign Up</a>
                  </Button>
                </div>
              </div>
            )}
          </header>
        </AnimatedSection>

        {/* Hero Section */}
        <AnimatedSection className="text-center bg-gradient-to-b from-[#F2EEFF] to-[#fff] rounded-[30px] sm:rounded-[50px] px-4 sm:px-6 min-h-[85vh] sm:min-h-[90vh] w-full flex flex-col justify-center pb-6 gap-y-4 sm:gap-y-6">
          {/* Trust Factor */}
          <div className="mb-6 sm:mb-8">
            <div className="inline-flex items-center gap-1 bg-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-full">
              <div className="flex -space-x-1 sm:-space-x-2">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white bg-slate-300"></div>
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white bg-slate-300"></div>
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white bg-slate-300"></div>
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-white bg-slate-300"></div>
              </div>
              <span className="text-xs sm:text-sm text-gray-600 font-normal">used by 200+ ai builders</span>
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-[#2B1463] leading-tight sm:leading-[1.2] tracking-tighter mb-0 font-normal">
            <span className="animate-[fadeIn_1s_ease-out]">
              simple email forwarding <br />
              with API-ready automations
            </span>
          </h1>

          <p className="text-gray-600 text-base sm:text-lg lg:text-xl mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed animate-[fadeIn_1.7s_ease-out] px-4 sm:px-8 lg:px-28">
            Control every inbox with code. Fully programmatic with webhook integrations, spam filtering and{" "}
            <code className="bg-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-sm font-mono text-gray-800 border relative group cursor-pointer hover:bg-white transition-all duration-300 inline-flex items-center">
              <span className="whitespace-nowrap">npm i</span>
              <svg
                className="w-0 h-3 ml-0 opacity-0 group-hover:opacity-100 group-hover:w-3 group-hover:ml-1 transition-all duration-300 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
              </svg>
            </code>{" "}
            setup
          </p>

          <div className="relative max-w-2xl mx-auto mb-4">
            {/* Gradient Glow Background Component */}
            <div className="absolute inset-0 -m-4 sm:-m-8 z-0">
              <div
                className="w-full h-1/2 opacity-30 animate-gradientGlow blur-3xl rounded-3xl"
                style={{
                  background:
                    "linear-gradient(to right, #FF6B9D, #C147E9, #9C3EE8, #6C47FF, #8B5CF6, #A855F7, #EC4899, #F59E0B, #EAB308, #FF6B9D)",
                  backgroundSize: "200% 100%",
                }}
              />
            </div>

            {/* Main Input Container */}
            <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.2)] sm:shadow-[0_0_0_8px_rgba(255,255,255,0.2)]">
              <div className="flex-1 relative">
                <Input
                  value={isComplete ? inputValue : displayText}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={isComplete ? "yourdomain.com" : ""}
                  className="border-0 focus:border-b focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ring-0 outline-none shadow-none bg-transparent placeholder:text-gray-400 h-[40px] sm:h-[44px] rounded-none text-sm sm:text-md text-center sm:text-left"
                  readOnly={!isComplete}
                />
                {!isComplete && (
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 w-0.5 h-4 bg-gray-400"></div>
                )}
              </div>
              <div className="relative text-neutral-700 bg-white text-xs sm:text-sm border-neutral-100 px-2 sm:px-3 flex items-center justify-center">
                <p className="relative bg-white z-10 py-1">forwards to</p>
                <span className="absolute z-0 -top-[50%] left-1/2 transform -translate-x-1/2 h-[200%] w-[1px] bg-gray-200 hidden sm:block"></span>
              </div>
              <div className="flex-1 relative">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="name@gmail.com"
                  className="border-0 focus:border-b focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ring-0 outline-none shadow-none bg-transparent placeholder:text-gray-400 h-[40px] sm:h-[44px] rounded-none text-sm sm:text-md text-center sm:text-left"
                />
              </div>
              <Button asChild>
                <a href="/login">
                  <span className="hidden sm:inline">Create free alias</span>
                  <span className="sm:hidden">Create alias</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm text-gray-400 animate-[fadeIn_2.1s_ease-out]">
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
              </svg>
              No credit card required
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9L10,17Z" />
              </svg>
              Full privacy protection
            </div>
          </div>
        </AnimatedSection>

        {/* Hero Image Section - Half above fold, half below */}
        <div className="relative w-full flex justify-center -mt-16 sm:-mt-44 mb-4 sm:mb-4 z-10 opacity-0 animate-[fadeIn_1s_ease-out_1.5s_forwards]">
          <div className="w-full">
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
        <AnimatedSection className="px-4 sm:px-6 bg-white w-full m-2 sm:m-4 py-12 sm:py-20 py-0 z-1 rounded-[30px] sm:rounded-[50px]">
          <h2 className="text-3xl sm:text-4xl font-medium text-center mb-8 sm:mb-12">how does it work?</h2>

          <div className="space-y-6 sm:space-y-8">
            {/* Email Forwarding Dashboard */}
            <AnimatedCard
              className="bg-white border-0 rounded-xl shadow-lg max-w-3xl mx-auto transform -rotate-1"
              delay={50}
            >
              <CardContent className="p-0">
                {/* Dashboard Header */}
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-100">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#6C47FF] rounded-full flex items-center justify-center">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 bg-white rounded-full flex items-center justify-center">
                        <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-[#6C47FF] rounded-full"></div>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-base sm:text-lg text-gray-900">inbound.new</h3>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full"></div>
                        <span className="text-xs sm:text-sm text-green-600">Email forwarding active</span>
                      </div>
                    </div>
                  </div>
                  <svg
                    className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>

                {/* Email Forwards List */}
                <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
                  {/* Wildcard Forward */}
                  <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                    <div className="font-semibold text-gray-900 w-8 sm:w-16 flex-shrink-0">*</div>
                    <div className="text-gray-400 hidden sm:block">@inbound.new</div>
                    <div className="text-gray-300 text-[10px] sm:text-xs font-normal ml-2 sm:ml-8 hidden sm:block">
                      FORWARDS TO
                    </div>
                    <div className="flex-1 font-normal text-gray-500 truncate">ryanceo@gmail.com</div>
                    <button className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0">
                      <svg
                        className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Individual Forwards */}
                  {[
                    { name: "support", email: "supportteam@live.com" },
                    { name: "help", email: "gilfoyle@protonmail.com" },
                    { name: "affiliate", email: "jdunn@outlook.com" },
                    { name: "ryan", email: "hello@ryan.ceo" },
                  ].map((forward, index) => (
                    <div key={index} className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                      <div className="font-normal text-gray-900 w-12 sm:w-16 flex-shrink-0 truncate">
                        {forward.name}
                      </div>
                      <div className="text-gray-400 hidden sm:block">@inbound.new</div>
                      <div className="text-gray-300 text-[10px] sm:text-xs font-normal ml-2 sm:ml-8 hidden sm:block">
                        FORWARDS TO
                      </div>
                      <div className="flex-1 font-normal text-gray-500 truncate">{forward.email}</div>
                      <button className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0">
                        <svg
                          className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {/* Add New Alias */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 border-t p-3 sm:p-4 pl-0 bg-gray-50 border-gray-100">
                    <div className="flex items-center gap-2 sm:gap-4 flex-1">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 flex-shrink-0"></div>
                      <input
                        type="text"
                        placeholder="new-alias"
                        className="font-normal text-gray-500 w-16 sm:w-20 border-0 border-b border-gray-300 focus:border-[#6C47FF] focus:outline-none bg-transparent text-xs sm:text-sm"
                      />
                      <div className="text-gray-500 text-xs sm:text-sm">@inbound.new</div>
                      <div className="text-gray-300 text-[10px] sm:text-xs font-normal ml-2 sm:ml-8 hidden sm:block">
                        FORWARDS TO
                      </div>
                      <div className="flex-1 text-gray-500 text-xs sm:text-sm truncate hidden sm:block">
                        ryanceo@gmail.com
                      </div>
                    </div>
                    <Button>
                      ADD
                    </Button>
                  </div>
                </div>
              </CardContent>
            </AnimatedCard>

            <div className="flex justify-center">
              <ArrowDown className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
            </div>

            {/* Email Compose Interface */}
            <AnimatedCard
              className="bg-white border-0 rounded-xl shadow-lg max-w-2xl mx-auto transform rotate-1"
              delay={100}
            >
              <CardContent className="p-0">
                {/* Email Header */}
                <div className="flex items-center gap-2 p-3 sm:p-4 rounded-tl-xl rounded-tr-xl bg-gray-50">
                  <span className="text-xs sm:text-sm text-gray-500 ml-1 sm:ml-2">New Message</span>
                </div>

                {/* Email Form */}
                <div className="p-4 sm:p-6 space-y-2 sm:space-y-3">
                  <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                    <span className="text-gray-400 w-6 sm:w-4 flex-shrink-0">To:</span>
                    <span className="text-gray-700 truncate">support@inbound.new</span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm">
                    <span className="text-gray-400 w-6 sm:w-8 flex-shrink-0">Subject:</span>
                    <span className="text-gray-700 ml-4 truncate">Can I demo Inbound?</span>
                  </div>
                  <div className="border-t border-gray-100 pt-3 sm:pt-4">
                    <div className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                      <p>Hi there,</p>
                      <p className="mt-2">
                        I came across Inbound on Hackernews. Looks promising, needed this exact thing. Can I get a demo?
                      </p>
                      <p className="mt-2">
                        Best regards,
                        <br />
                        Potential customer
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-3 sm:pt-4 border-t border-gray-100">
                    <Button size="sm">
                      Send
                    </Button>
                  </div>
                </div>
              </CardContent>
            </AnimatedCard>

            <div className="flex justify-center">
              <ArrowDown className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
            </div>

            {/* Terminal/Code Output */}
            <AnimatedCard
              className="bg-neutral-900 rounded-xl shadow-lg max-w-2xl mx-auto transform -rotate-1"
              delay={200}
            >
              <CardContent className="p-4 sm:p-6 text-white">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full"></div>
                  <span className="text-xs sm:text-sm text-gray-400">Incoming Email Log</span>
                </div>
                <div className="font-mono text-xs sm:text-sm space-y-1">
                  <div className="text-green-400 break-all">✓ Email received from user@company.com</div>
                  <div className="text-blue-400 break-all">→ Subject: Can I demo Inbound?</div>
                  <div className="text-yellow-400">→ Webhook: Processing...</div>
                </div>
              </CardContent>
            </AnimatedCard>

            <div className="flex justify-center">
              <ArrowDown className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
            </div>

            {/* AI Agent Processing */}
            <AnimatedCard
              className="bg-neutral-900 rounded-xl shadow-lg max-w-3xl mx-auto transform rotate-1"
              delay={300}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-700 rounded flex items-center justify-center shadow-sm">
                    <span className="text-white text-[10px] sm:text-xs font-bold">AI</span>
                  </div>
                  <span className="font-semibold text-neutral-200 text-sm sm:text-base">AI Agent Processing</span>
                </div>
                <Card className="bg-neutral-800 border-neutral-700">
                  <CardContent className="p-3 sm:p-4 font-mono text-xs sm:text-sm overflow-x-auto">
                    <div className="text-neutral-200 font-semibold break-all">
                      POST https://api.yourapp.com/agent/process-email
                    </div>
                    <div className="mt-2 text-gray-800">
                      <div className="space-y-1">
                        <div>
                          <span className="text-neutral-300">"subject":</span>{" "}
                          <span className="text-green-600">"Can I get a dmeo?"</span>,
                        </div>
                        <div>
                          <span className="text-neutral-300">"metadata":</span> {`{`}
                        </div>
                        <div className="ml-2 sm:ml-4">
                          <span className="text-neutral-300">"intent":</span>{" "}
                          <span className="text-green-600">"onboarding"</span>,
                        </div>
                        <div className="ml-2 sm:ml-4">
                          <span className="text-neutral-300">"sentiment":</span>{" "}
                          <span className="text-green-600">"positive"</span>,
                        </div>
                        <div className="ml-2 sm:ml-4">
                          <span className="text-neutral-300">"priority":</span>{" "}
                          <span className="text-red-600">"high"</span>
                        </div>
                        <div className="ml-2 sm:ml-4">
                          <span className="text-neutral-300">"spam":</span>{" "}
                          <span className="text-purple-600">"false"</span>
                        </div>
                        <div>{`}`}</div>
                      </div>
                    </div>
                    <div className="mt-3 sm:mt-4 text-green-600 font-semibold">200 OK - Delivered successfully</div>
                  </CardContent>
                </Card>
              </CardContent>
            </AnimatedCard>
          </div>
        </AnimatedSection>

        {/* Connect to Any App Section */}
        <SplitLayoutCard />

        {/* Built for AI Builders */}
        <AnimatedSection className="py-12 sm:py-16 px-6 sm:px-16 lg:px-32 w-full m-6 sm:m-12 text-center bg-gradient-to-b from-[#EEF5FE] to-[#FDF3ED] rounded-[30px] sm:rounded-[50px] my-12 sm:my-20">
          {/* Trust Avatars */}
          <div className="flex justify-center mb-8 sm:mb-12">
            <div className="flex -space-x-1 sm:-space-x-2">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-white bg-slate-600"></div>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-white bg-slate-500"></div>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-white bg-slate-400"></div>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-white bg-slate-400"></div>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-white bg-slate-300"></div>
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-white bg-slate-300"></div>
            </div>
          </div>

          <h2 className="text-3xl sm:text-4xl font-medium mb-4 sm:mb-6">built for ai builders</h2>
          <p className="text-gray-600 text-base sm:text-lg mb-6 sm:mb-8 leading-relaxed px-4 sm:px-16 lg:px-56">
            deploy ai agents to email addresses with our typescript sdk and rest api. full programmatic control over
            your agent's mail infrastructure.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mt-8 sm:mt-12">
            {/* TypeScript SDK */}
            <AnimatedCard className="shadow-sm border-gray-200 rounded-2xl" delay={100} direction="left">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <span className="font-semibold text-base sm:text-lg">TypeScript SDK</span>
                </div>
                <p className="text-gray-600 mb-3 sm:mb-4 text-left text-sm sm:text-base">
                  Build out your own package and start creating email addresses and webhooks with full type safety.
                </p>
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-3 sm:p-4 text-left overflow-x-auto">
                    <code className="text-xs sm:text-sm font-mono block whitespace-nowrap">
                      <div className="text-green-400">npm install @inbound/sdk</div>
                      <div className="text-blue-400 mt-2 inline">import</div>{" "}
                      <div className="text-yellow-300 inline">{"{ createInboundClient }"}</div>{" "}
                      <div className="text-blue-400 inline">from</div>{" "}
                      <div className="text-green-300 inline">'@inbound/sdk'</div>
                      <br />
                      <br />
                      <div className="text-blue-400 inline">const</div> <div className="text-white inline">client</div>{" "}
                      <div className="text-pink-400 inline">=</div>{" "}
                      <div className="text-yellow-300 inline">createInboundClient</div>
                      <div className="text-white inline">()</div>
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
            <AnimatedCard className="shadow-sm border-gray-200 rounded-2xl" delay={200} direction="right">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 mb-3 sm:mb-4">
                  <span className="font-semibold text-base sm:text-lg">REST API</span>
                </div>
                <p className="text-gray-600 mb-3 sm:mb-4 text-left text-sm sm:text-base">
                  Use our REST API directly from any language or platform to integrate email receiving into your
                  workflow.
                </p>
                <Card className="bg-gray-900 border-gray-800">
                  <CardContent className="p-3 sm:p-4 text-left overflow-x-auto">
                    <code className="text-xs sm:text-sm font-mono block">
                      <div className="text-pink-400 inline">curl</div> <div className="text-blue-400 inline">-X</div>{" "}
                      <div className="text-green-300 inline">POST</div> <div className="text-white inline">\</div>
                      <br />
                      <div className="text-blue-400 inline">-H</div>{" "}
                      <div className="text-green-300 inline break-all">"Authorization: Bearer YOUR_API_KEY"</div>{" "}
                      <div className="text-white inline">\</div>
                      <br />
                      <div className="text-blue-400 inline">-H</div>{" "}
                      <div className="text-green-300 inline break-all">"Content-Type: application/json"</div>{" "}
                      <div className="text-white inline">\</div>
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

          <AnimatedSection className="text-center pt-16 sm:pt-32 pb-12 sm:pb-20 m-2 sm:m-4 rounded-[30px] sm:rounded-[50px]">
            <h2 className="text-3xl sm:text-4xl font-medium mb-4">with a 3 step setup</h2>
            <EmailSetupFlow />
          </AnimatedSection>
        </AnimatedSection>

        {/* Pricing */}
        <AnimatedSection className="px-4 sm:px-6 w-full mx-auto bg-white rounded-2xl border-gray-200 my-12 sm:my-20 py-12 sm:py-20 border-0">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-3xl sm:text-4xl font-medium mb-3 sm:mb-4">simple pricing</h2>
            <p className="text-gray-600 text-sm sm:text-base px-4">
              choose the plan that's right for your needs. start with our free tier and upgrade as you grow.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <PricingTable />
          </div>
        </AnimatedSection>
      </div>

      {/* Footer */}
      <footer className="bg-white text-black py-8 sm:py-12 tracking-tight w-full">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center justify-between">
            <div className="flex items-center gap-2 justify-center md:justify-start">
              <Image
                src="https://inbound.new/inbound-logo-3.png"
                alt="Inbound Logo"
                width={28}
                height={28}
                className="rounded-lg shadow-sm sm:w-8 sm:h-8"
              />
              <span className="font-semibold text-base sm:text-lg text-black">inbound</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm text-gray-400 justify-center md:justify-end">
              <a href="https://twitter.com/inbound_email" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">
                Contact us on 𝕏
              </a>
              <a href="https://discord.gg/your-discord-server" target="_blank" rel="noopener noreferrer" className="flex gap-1 sm:gap-2 items-center hover:text-black transition-colors">
                Discord{" "}
                <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </a>
              <a href="/privacy" className="hover:text-black transition-colors">
                Privacy
              </a>
              <a href="/terms" className="hover:text-black transition-colors">
                Terms
              </a>
              <a href="/docs" className="hover:text-black transition-colors hidden sm:inline">
                Docs
              </a>
              <a href="mailto:support@inbound.email" className="hover:text-black transition-colors">
                Support
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
