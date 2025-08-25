import { Button } from "@/components/ui/button"
import ChevronDown from "@/components/icons/chevron-down"
import BoltLightning from "@/components/icons/bolt-lightning"
import Envelope2 from "@/components/icons/envelope-2"
import ShieldCheck from "@/components/icons/shield-check"
import Code2 from "@/components/icons/code-2"
import File2 from "@/components/icons/file-2"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import InboundIcon from "./icons/inbound"

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

export default async function MarketingHeader() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  // Fetch GitHub stars server-side
  const githubStars = await getGitHubStars()

  return (
    <header className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-100">
      <div className="flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          <a href="/" className="flex items-center gap-2 min-w-0">
            <InboundIcon width={32} height={32} />
            <div className="flex flex-col items-start gap-0 min-w-0">
              <span className="text-xl sm:text-2xl font-bold text-black truncate">inbound</span>
              <span className="text-xs text-gray-500 -mt-2 hidden sm:block">by exon</span>
            </div>
          </a>
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
            <DropdownMenuContent align="center" className="w-80 p-2">
              <DropdownMenuItem asChild className="p-0">
                <a href="/email-as-webhook" className="w-full cursor-pointer p-4 rounded-lg hover:bg-blue-50 hover:border-blue-200 border border-transparent transition-all duration-200 group">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-blue-200 transition-colors">
                      <BoltLightning className="w-4 h-4 text-blue-600 group-hover:text-blue-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm group-hover:text-blue-900">Email as Webhook</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">Convert emails into HTTP POST requests to your endpoints</div>
                    </div>
                  </div>
                </a>
              </DropdownMenuItem>
              
              <DropdownMenuItem asChild className="p-0">
                <a href="/improvmx-alternative" className="w-full cursor-pointer p-4 rounded-lg hover:bg-green-50 hover:border-green-200 border border-transparent transition-all duration-200 group">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-green-200 transition-colors">
                      <Envelope2 className="w-4 h-4 text-green-600 group-hover:text-green-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm group-hover:text-green-900">ImprovMX Alternative</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-green-600">Better email forwarding with more control and reliability</div>
                    </div>
                  </div>
                </a>
              </DropdownMenuItem>
              
              <DropdownMenuItem asChild className="p-0">
                <a href="/addtoblocklist" className="w-full cursor-pointer p-4 rounded-lg hover:bg-red-50 hover:border-red-200 border border-transparent transition-all duration-200 group">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-red-200 transition-colors">
                      <ShieldCheck className="w-4 h-4 text-red-600 group-hover:text-red-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm group-hover:text-red-900">Block Spam</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-red-600">Advanced spam filtering and email blocking</div>
                    </div>
                  </div>
                </a>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator className="my-2" />
              
              <DropdownMenuItem asChild className="p-0">
                <a href="/changelog" className="w-full cursor-pointer p-4 rounded-lg hover:bg-purple-50 hover:border-purple-200 border border-transparent transition-all duration-200 group">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-purple-200 transition-colors">
                      <File2 className="w-4 h-4 text-purple-600 group-hover:text-purple-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm group-hover:text-purple-900">Changelog</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-purple-600">Latest updates and improvements</div>
                    </div>
                  </div>
                </a>
              </DropdownMenuItem>
              
              <div className="border-t border-gray-100 my-2"></div>
              
              <DropdownMenuItem asChild className="p-0">
                <a href="/docs" className="w-full cursor-pointer p-4 rounded-lg hover:bg-purple-50 hover:border-purple-200 border border-transparent transition-all duration-200 group">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-purple-200 transition-colors">
                      <Code2 className="w-4 h-4 text-purple-600 group-hover:text-purple-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm group-hover:text-purple-900">Documentation</div>
                      <div className="text-xs text-gray-500 mt-1 group-hover:text-purple-600">API references, guides, and integration examples</div>
                    </div>
                  </div>
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Conditionally show Sign In or Go to Dashboard based on auth state */}
          {session ? (
            <Button variant="primary" asChild className="text-sm px-3 py-2">
              <a href="/logs">
                <span className="hidden sm:inline">Go to Email Flow</span>
                <span className="sm:hidden">Flow</span>
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