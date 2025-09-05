"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import ArrowBoldRight from "@/components/icons/arrow-bold-right"
import { useTypingEffect } from "@/hooks/useTypingEffect"
import { AnimatedSection } from "@/components/AnimatedSection"

export function HeroSection() {
  const [inputValue, setInputValue] = useState("")
  const { displayText, isComplete } = useTypingEffect(["inbound.new"], 150)

  return (
    <AnimatedSection className="text-center bg-gradient-to-b from-muted/40 to-background rounded-[30px] sm:rounded-[50px] px-4 sm:px-6 min-h-[85vh] sm:min-h-[90vh] w-full flex flex-col justify-center pb-6 gap-y-4 sm:gap-y-6 border border-border">
      <h1 className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-foreground leading-tight sm:leading-[1.2] tracking-tighter mb-0 font-normal">
        <span className="animate-[fadeIn_1s_ease-out]">
          email receiving infrastructure <br />
          for modern applications
        </span>
      </h1>

      <p className="text-muted-foreground text-sm xs:text-base sm:text-lg lg:text-xl mb-4 xs:mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed animate-[fadeIn_1.7s_ease-out] px-2 xs:px-4 sm:px-8 lg:px-28">
        Programmatically manage email addresses, receive emails via webhooks, and build powerful email-driven automations with our{" "}
        <code className="bg-card px-1 xs:px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs xs:text-sm font-mono text-foreground border border-border relative group cursor-pointer hover:bg-card/80 transition-all duration-300 inline-flex items-center">
          <span className="whitespace-nowrap">TypeScript SDK</span>
          <svg
            className="w-0 h-3 ml-0 opacity-0 group-hover:opacity-100 group-hover:w-3 group-hover:ml-1 transition-all duration-300 flex-shrink-0 hidden sm:inline"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
          </svg>
        </code>
      </p>

      <div className="relative max-w-2xl mx-auto mb-4 w-full">
        {/* Gradient Glow Background Component */}
        <div className="absolute inset-0 -m-2 xs:-m-4 sm:-m-8 z-0">
          <div
            className="w-full h-1/2 opacity-20 xs:opacity-30 animate-gradientGlow blur-2xl xs:blur-3xl rounded-3xl"
            style={{
              background:
                "linear-gradient(to right, #6C47FF, #8B5CF6, #A855F7, #EC4899, #F59E0B, #EAB308, #6C47FF)",
              backgroundSize: "200% 100%",
            }}
          />
        </div>

        {/* Main Input Container */}
        <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 xs:gap-3 sm:gap-4 p-2 xs:p-3 sm:p-4 rounded-xl xs:rounded-2xl bg-card shadow-[0_0_0_2px_rgba(255,255,255,0.1)] xs:shadow-[0_0_0_4px_rgba(255,255,255,0.1)] sm:shadow-[0_0_0_8px_rgba(255,255,255,0.1)] border border-border">
          <div className="flex-1 relative">
            <Input
              value={isComplete ? inputValue : displayText}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={isComplete ? "yourdomain.com" : ""}
              className="border-0 focus:border-b focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ring-0 outline-none shadow-none bg-transparent placeholder:text-muted-foreground h-[36px] xs:h-[40px] sm:h-[44px] rounded-none text-xs xs:text-sm sm:text-md text-center sm:text-left px-2"
              readOnly={!isComplete}
            />
            {!isComplete && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 w-0.5 h-3 xs:h-4 bg-muted-foreground"></div>
            )}
          </div>
          <div className="relative text-muted-foreground bg-card text-[11px] xs:text-xs sm:text-sm px-1 xs:px-2 sm:px-3 flex items-center justify-center">
            <p className="relative bg-card z-10 py-0.5 xs:py-1">forwards to</p>
            <span className="absolute z-0 -top-[50%] left-1/2 transform -translate-x-1/2 h-[200%] w-[1px] bg-border hidden sm:block"></span>
          </div>
          <div className="flex-1 relative">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="name@gmail.com"
              className="border-0 focus:border-b focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ring-0 outline-none shadow-none bg-transparent placeholder:text-muted-foreground h-[36px] xs:h-[40px] sm:h-[44px] rounded-none text-xs xs:text-sm sm:text-md text-center sm:text-left px-2"
            />
          </div>
          <Button asChild size="sm" className="h-[36px] xs:h-[40px] sm:h-auto">
            <a href="/login">
              <span className="hidden sm:inline">Create free alias</span>
              <span className="sm:hidden text-xs">Create alias</span>
              <ArrowBoldRight width="14" height="14" className="xs:w-4 xs:h-4" />
            </a>
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm text-muted-foreground animate-[fadeIn_2.1s_ease-out]">
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
  )
} 