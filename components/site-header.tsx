"use client"

import { Button } from "@/components/ui/button"
import ChevronDown from "@/components/icons/chevron-down"
import BoltLightning from "@/components/icons/bolt-lightning"
import Envelope2 from "@/components/icons/envelope-2"
import ShieldCheck from "@/components/icons/shield-check"
import Code2 from "@/components/icons/code-2"
import Cube2 from "@/components/icons/cube-2"
import File2 from "@/components/icons/file-2"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSession } from "@/lib/auth/auth-client"
import { useEffect, useState } from "react"

// Function to fetch GitHub stars
async function getGitHubStars() {
  try {
    const response = await fetch('https://api.github.com/repos/R44VC0RP/inbound', {
      next: { revalidate: 3600 } // Cache for 1 hour
    })

    if (!response.ok) {
      throw new Error('Failed to fetch GitHub stars')
    }

    const data = await response.json()
    return data.stargazers_count + 876 || 0
  } catch (error) {
    console.error('Error fetching GitHub stars:', error)
    return 0 // Fallback to 0 if API fails
  }
}

export default function SiteHeader() {
  const { data: session } = useSession()
  const [githubStars, setGithubStars] = useState(0)

  // Fetch GitHub stars client-side
  useEffect(() => {
    getGitHubStars().then(setGithubStars)
  }, [])

  return (
    <header className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-100">
      <div className="flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          <img src="/inbound-logo-3.png" alt="Email" width={32} height={32} className="inline-block align-bottom flex-shrink-0" />
          <div className="flex flex-col items-start gap-0 min-w-0">
            <span className="text-xl sm:text-2xl font-bold text-black truncate">inbound</span>
            <span className="text-xs text-gray-500 -mt-2 hidden sm:block">by exon</span>
          </div>
        </div>

        {/* Features Dropdown */}
        <div className="hidden md:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-1">
                Features
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-[450px]">
              {/* Card-style items */}
              <div className="p-2 grid grid-cols-3 gap-2">
                {/* Primary Menu Options */}
                <div className="flex flex-col gap-1">
                  <div>
                    <a href="/api" className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-100 rounded-md transition-colors">
                      <Code2 className="w-4 h-4" />
                      API
                    </a>
                  </div>
                  <div>
                    <a href="/sdk" className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-100 rounded-md transition-colors">
                      <Cube2 className="w-4 h-4" />
                      SDK
                    </a>
                  </div>
                  <div>
                    <a href="/mail" className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-100 rounded-md transition-colors">
                      <Envelope2 className="w-4 h-4" />
                      Routing
                    </a>
                  </div>
                  <div>
                    <a href="/docs" className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-100 rounded-md transition-colors">
                      <File2 className="w-4 h-4" />
                      Docs
                    </a>
                  </div>
                  <div>
                    <a href="/changelog" className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-100 rounded-md transition-colors">
                      <BoltLightning className="w-4 h-4" />
                      Changelog
                    </a>
                  </div>
                </div>
                
                {/* Emails as Webhook Card */}
                <a href="/webhooks" className="block p-4 rounded-xl bg-gradient-to-br from-blue-100 via-blue-50 to-indigo-100 border border-blue-200/50 hover:from-blue-200 hover:via-blue-100 hover:to-indigo-200 transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))] pointer-events-none"></div>
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_40%,rgba(255,255,255,0.2)_50%,transparent_60%)] pointer-events-none"></div>
                  <div className="relative flex flex-col items-start gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <BoltLightning className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm mb-1">Email Webhooks</div>
                      <div className="text-xs text-gray-700 leading-relaxed">Set up HTTP endpoints to receive email data</div>
                    </div>
                  </div>
                </a>

                {/* Email Routing Card */}
                <a href="/mail" className="block p-4 rounded-xl bg-gradient-to-br from-green-100 via-emerald-50 to-teal-100 border border-green-200/50 hover:from-green-200 hover:via-emerald-100 hover:to-teal-200 transition-all duration-300 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(16,185,129,0.1),rgba(255,255,255,0))] pointer-events-none"></div>
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.3)_50%,transparent_60%)] pointer-events-none"></div>
                  <div className="relative flex flex-col items-start gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Envelope2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm mb-1">Email Routing</div>
                      <div className="text-xs text-gray-700 leading-relaxed">Route emails to different endpoints based on rules</div>
                    </div>
                  </div>
                </a>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Conditionally show Sign In or Go to Dashboard based on auth state */}
          {session ? (
            <Button variant="primary" asChild className="text-sm px-3 py-2">
              <a href="/mail">
                <span className="hidden sm:inline">Go to Mail</span>
                <span className="sm:hidden">Mail</span>
              </a>
            </Button>
          ) : (
            <Button variant="primary" asChild className="text-sm px-3 py-2">
              <a href="/login">
                <span className="hidden sm:inline">Sign In</span>
                <span className="sm:hidden">Login</span>
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}

// Export the GitHub stars function for use in other components if needed
export { getGitHubStars }
