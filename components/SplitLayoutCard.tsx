"use client"

import { Card, CardContent } from "@/components/ui/card"
import { AnimatedCard } from "@/components/AnimatedCard"
import { AnimatedSection } from "@/components/AnimatedSection"

export default function SplitLayoutCard() {
  const apps = [
    {
      name: "Whatsapp reply",
      icon: "✓",
      color: "bg-gradient-to-b from-[#F2EEFF] to-[#fff]",
      description: "",
      delay: 100,
    },
    {
      name: "AI agents",
      icon: "✓",
      color: "bg-gradient-to-b from-[#F2EEFF] to-[#fff]",
      description: "",
      delay: 200,
    },
    {
      name: "Post on LinkedIn",
      icon: "✓",
      color: "bg-gradient-to-b from-[#F2EEFF] to-[#fff]",
      description: "",
      delay: 300,
    },
    {
      name: "Google Drive",
      icon: "✓",
      color: "bg-gradient-to-b from-[#F2EEFF] to-[#fff]",
      description: "",
      delay: 400,
    },
  ]

  return (
    <AnimatedSection className="px-4 sm:px-6 bg-white w-full">
      <div className="max-w-6xl mx-auto">
        

        <div className="relative">
          

          {/* Curved Dotted Connection Lines - Hidden on mobile */}
          <div className="absolute -top-32 sm:-top-40 left-1/2 transform -translate-x-1/2 hidden lg:block pointer-events-none">
            {/* SVG for curved dotted lines */}
            <svg width="800" height="200" className="absolute -translate-x-1/2">
              {/* Left curve to YouTube */}
              <path
                d="M 400 0 Q 200 80 100 160"
                stroke="#D1D5DB"
                strokeWidth="2"
                strokeDasharray="6,6"
                fill="none"
                className="animate-pulse"
              />
              {/* Left-center curve to MeisterTask */}
              <path
                d="M 400 0 Q 300 60 250 160"
                stroke="#D1D5DB"
                strokeWidth="2"
                strokeDasharray="6,6"
                fill="none"
                className="animate-pulse"
                style={{ animationDelay: "0.5s" }}
              />
              {/* Right-center curve to MeisterNote */}
              <path
                d="M 400 0 Q 500 60 550 160"
                stroke="#D1D5DB"
                strokeWidth="2"
                strokeDasharray="6,6"
                fill="none"
                className="animate-pulse"
                style={{ animationDelay: "1s" }}
              />
              {/* Right curve to Google Drive */}
              <path
                d="M 400 0 Q 600 80 700 160"
                stroke="#D1D5DB"
                strokeWidth="2"
                strokeDasharray="6,6"
                fill="none"
                className="animate-pulse"
                style={{ animationDelay: "1.5s" }}
              />
            </svg>
          </div>

          App Cards Grid
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mt-8 lg:mt-24">
            {apps.map((app, index) => (
              <AnimatedCard
                key={app.name}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group"
                delay={app.delay}
                direction="up"
              >
                <CardContent className="p-6 text-center">
                  {/* App Icon */}
                  <div
                    className={`w-16 h-16 ${app.color} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <span className="text-2xl">{app.icon}</span>
                  </div>

                  {/* App Name */}
                  <h3 className="font-semibold text-lg mb-2 text-gray-900">{app.name}</h3>

                  {/* Description */}
                  <p className="text-gray-600 text-sm leading-relaxed mb-4">{app.description}</p>

                  {/* Connection Status */}
                  <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span>Connected</span>
                  </div>
                </CardContent>
              </AnimatedCard>
            ))}
          </div>

          {/* Call to Action */}
          <div className="text-center mt-6 sm:mt-8">
            <div className="inline-flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-full text-sm text-gray-600 mb-6">
              <span>⚡</span>
              <span>Works with 1000+ apps via webhooks</span>
            </div>
            <div>
              <a
                href="#"
                className="text-[#6C47FF] hover:text-[#5A3DE8] font-medium text-sm sm:text-base inline-flex items-center gap-1 group"
              >
                Browse all integrations
                <svg
                  className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </AnimatedSection>
  )
}
