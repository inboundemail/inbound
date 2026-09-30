import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import type { Metadata } from 'next'
import Link from 'next/link'

// Nucleo icon imports
import ArrowBoldRight from "@/components/icons/arrow-bold-right"
import CircleUser from "@/components/icons/circle-user"
import BoltLightning from "@/components/icons/bolt-lightning"
import Check2 from "@/components/icons/check-2"
import InboundIcon from "@/components/icons/inbound"
import Code2 from "@/components/icons/code-2"
import ShieldCheck from "@/components/icons/shield-check"
import Timer from "@/components/icons/timer"
import Globe2 from "@/components/icons/globe-2"
import Image2 from "@/components/icons/image-2"

export const metadata: Metadata = {
  title: 'Free Avatar API - BIMI, Gravatar & Smart Fallbacks',
  description: 'Free avatar API with cascading sources: BIMI company logos, Gravatar, unavatar.io, and generated initials. Fast, cached, and completely free. No API key required.',
  keywords: [
    'avatar API',
    'gravatar API',
    'BIMI API',
    'unavatar API',
    'profile picture API',
    'user avatar API',
    'free avatar API',
    'avatar generator',
    'profile image API',
    'gravatar fallback',
    'user initials avatar',
    'avatar placeholder',
    'profile picture generator',
    'user avatar service',
    'gravatar alternative',
    'avatar API free',
    'company logo API',
    'brand avatar API'
  ],
  openGraph: {
    title: 'Free Avatar API - BIMI, Gravatar & Smart Fallbacks',
    description: 'Free avatar API with cascading sources: BIMI company logos, Gravatar, unavatar.io, and generated initials. Fast, cached, and completely free.',
    type: 'website',
    url: 'https://inbound.new/avatar-api',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Avatar API - BIMI, Gravatar & Smart Fallbacks',
    description: 'Free avatar API with cascading sources: BIMI company logos, Gravatar, unavatar.io, and generated initials.',
  },
  alternates: {
    canonical: 'https://inbound.new/avatar-api'
  }
}

export default async function AvatarAPIPage() {
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
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 rounded-full text-green-700 font-medium mb-6">
              <Check2 width="16" height="16" />
              100% Free Forever
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Free Avatar API
              <br />
              <span className="text-[#1C2894]">4 Cascading Sources</span>
            </h1>
            <p className="text-xl text-gray-600 mb-4 max-w-2xl mx-auto leading-relaxed">
              Smart avatar API with cascading fallbacks: BIMI company logos, Gravatar profiles, unavatar.io aggregation, 
              and beautiful generated initials. Fast, cached, and completely free. No API key required.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 max-w-md mx-auto mt-8">
              <Button variant="primary" asChild className="w-full sm:w-auto">
                <a href="#usage">
                  Get Started Free
                  <ArrowBoldRight width="12" height="12" className="ml-2" />
                </a>
              </Button>
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <a href="#examples">View Examples</a>
              </Button>
            </div>

            <p className="text-sm text-gray-500 mt-3">
              ✓ No signup required ✓ No rate limits ✓ No API key ✓ Cached for performance
            </p>
          </div>

          {/* Live Demo */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">See It In Action</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto mb-8">
              <div className="flex flex-col items-center gap-3">
                <img 
                  src="/api/avatar?email=user@example.com&name=John Doe" 
                  alt="Avatar for John Doe"
                  className="w-24 h-24 rounded-full border-2 border-gray-200"
                />
                <div className="text-sm text-gray-600">John Doe</div>
              </div>
              
              <div className="flex flex-col items-center gap-3">
                <img 
                  src="/api/avatar?email=jane.smith@example.com&name=Jane Smith" 
                  alt="Avatar for Jane Smith"
                  className="w-24 h-24 rounded-full border-2 border-gray-200"
                />
                <div className="text-sm text-gray-600">Jane Smith</div>
              </div>
              
              <div className="flex flex-col items-center gap-3">
                <img 
                  src="/api/avatar?name=Alex Chen" 
                  alt="Avatar for Alex Chen"
                  className="w-24 h-24 rounded-full border-2 border-gray-200"
                />
                <div className="text-sm text-gray-600">Alex Chen</div>
              </div>
              
              <div className="flex flex-col items-center gap-3">
                <img 
                  src="/api/avatar?email=support@company.com" 
                  alt="Avatar for support"
                  className="w-24 h-24 rounded-full border-2 border-gray-200"
                />
                <div className="text-sm text-gray-600">Support</div>
              </div>
            </div>

            <p className="text-gray-600">
              These avatars are generated in real-time. Refresh to see the API in action!
            </p>
          </div>

          {/* How It Works */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Cascading Avatar Strategy</h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {/* Step 1 - BIMI */}
              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-6 border border-indigo-200">
                <div className="w-14 h-14 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck width="28" height="28" className="text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">1. BIMI</h3>
                <p className="text-gray-600 text-sm">
                  Check for company logos via BIMI (Brand Indicators for Message Identification).
                </p>
              </div>

              {/* Step 2 - Gravatar */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Globe2 width="28" height="28" className="text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">2. Gravatar</h3>
                <p className="text-gray-600 text-sm">
                  Check if the user has a Gravatar profile using SHA-256 hash of their email.
                </p>
              </div>

              {/* Step 3 - unavatar */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                <div className="w-14 h-14 bg-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <CircleUser width="28" height="28" className="text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">3. unavatar</h3>
                <p className="text-gray-600 text-sm">
                  Try unavatar.io which aggregates GitHub, Twitter, Google, and other sources.
                </p>
              </div>

              {/* Step 4 - Generated */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                <div className="w-14 h-14 bg-green-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BoltLightning width="28" height="28" className="text-white" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">4. Initials</h3>
                <p className="text-gray-600 text-sm">
                  Generate beautiful initials avatar with smart name parsing and clean design.
                </p>
              </div>
            </div>
            
            <p className="text-center text-gray-500 text-sm mt-6">
              All results cached for 24 hours with 7-day stale-while-revalidate
            </p>
          </div>

          {/* API Usage */}
          <div className="mb-32" id="usage">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Simple API Usage</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Just add the API endpoint to your img tag. No authentication, no setup, no hassle.
            </p>

            <div className="space-y-8 max-w-4xl mx-auto text-left">
              {/* Basic Usage */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">Basic HTML</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`<!-- With email (tries Gravatar first) -->
<img src="https://inbound.new/api/avatar?email=user@example.com&name=John Doe" 
     alt="User avatar" 
     class="rounded-full w-12 h-12" />

<!-- With just name (generates initials) -->
<img src="https://inbound.new/api/avatar?name=Jane Smith" 
     alt="User avatar" 
     class="rounded-full w-12 h-12" />`}
                  </pre>
                </div>
              </div>

              {/* React Example */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">React / Next.js</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`import Image from 'next/image'

function UserAvatar({ user }) {
  const avatarUrl = \`https://inbound.new/api/avatar?\${new URLSearchParams({
    email: user.email,
    name: user.name
  })}\`
  
  return (
    <Image
      src={avatarUrl}
      alt={\`\${user.name}'s avatar\`}
      width={48}
      height={48}
      className="rounded-full"
    />
  )
}

// Or use as background image
function ProfileCard({ user }) {
  return (
    <div 
      className="w-32 h-32 rounded-full bg-cover"
      style={{ backgroundImage: \`url(\${avatarUrl})\` }}
    />
  )
}`}
                  </pre>
                </div>
              </div>

              {/* API Parameters */}
              <div className="bg-gray-900 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <h3 className="text-white font-semibold">API Parameters & Cascade Order</h3>
                </div>
                <div className="p-6 font-mono text-sm">
                  <pre className="text-gray-300 whitespace-pre-wrap">
{`GET https://inbound.new/api/avatar

Query Parameters:
  email  - User's email (triggers all lookups) - Optional
  name   - User's name (for initials fallback) - Optional
  
At least one parameter is required.

Cascade Order (with email):
  1. BIMI - Company logo from domain
  2. Gravatar - Personal avatar (SHA-256)
  3. unavatar.io - GitHub, Twitter, Google, etc.
  4. Generated - Beautiful initials

Response:
  - 302 Redirect to the avatar image
  - 24-hour cache (max-age + s-maxage)
  - 7-day stale-while-revalidate
  - Edge runtime for global speed

Example URLs:
  /api/avatar?email=user@example.com&name=John Doe
  /api/avatar?name=Jane Smith
  /api/avatar?email=ceo@company.com`}
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-12">Why Use This Avatar API?</h2>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {/* Completely Free */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Check2 width="32" height="32" className="text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">100% Free</h3>
                <p className="text-gray-600 text-sm">
                  No API keys, no rate limits, no hidden costs. Use it in any project without restrictions.
                </p>
              </div>

              {/* Fast & Cached */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Timer width="32" height="32" className="text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Lightning Fast</h3>
                <p className="text-gray-600 text-sm">
                  Edge-optimized with 24-hour caching and smart revalidation for instant loading.
                </p>
              </div>

              {/* Multi-Source */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <CircleUser width="32" height="32" className="text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">4 Avatar Sources</h3>
                <p className="text-gray-600 text-sm">
                  BIMI company logos, Gravatar profiles, unavatar.io aggregation, and generated initials.
                </p>
              </div>

              {/* Universal Coverage */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Globe2 width="32" height="32" className="text-indigo-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Universal Coverage</h3>
                <p className="text-gray-600 text-sm">
                  Checks multiple sources including GitHub, Twitter, Google, and more via unavatar.io.
                </p>
              </div>

              {/* Edge Runtime */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-yellow-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <BoltLightning width="32" height="32" className="text-yellow-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Global Edge</h3>
                <p className="text-gray-600 text-sm">
                  Runs on Vercel Edge Network for ultra-low latency worldwide.
                </p>
              </div>

              {/* No Dependencies */}
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Code2 width="32" height="32" className="text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Zero Setup</h3>
                <p className="text-gray-600 text-sm">
                  No libraries to install, no accounts to create. Just use the URL.
                </p>
              </div>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mb-32" id="examples">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Perfect For</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Use this avatar API in any application that needs user profile pictures.
            </p>

            <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto text-left">
              {/* SaaS Applications */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-8 border border-blue-200">
                <h3 className="text-xl font-bold text-gray-900 mb-4">SaaS Applications</h3>
                <p className="text-gray-600 mb-4">
                  Display user avatars in your dashboard, team lists, and comment sections without building your own avatar system.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    User profiles & settings
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    Team member lists
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    Activity feeds
                  </div>
                </div>
              </div>

              {/* Support Tools */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-8 border border-green-200">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Customer Support</h3>
                <p className="text-gray-600 mb-4">
                  Show customer avatars in your support ticket system, live chat, or helpdesk interface.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    Support ticket systems
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    Live chat widgets
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    Email client interfaces
                  </div>
                </div>
              </div>

              {/* Community Platforms */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-8 border border-purple-200">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Community Platforms</h3>
                <p className="text-gray-600 mb-4">
                  Display member avatars in forums, social networks, and community platforms.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    Forum posts & comments
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    Member directories
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    Leaderboards
                  </div>
                </div>
              </div>

              {/* Email Applications */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-8 border border-orange-200">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Email Applications</h3>
                <p className="text-gray-600 mb-4">
                  Show sender avatars in your email client, notification system, or mail dashboard.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    Email inbox views
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    Sender identification
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check2 width="16" height="16" className="text-green-500" />
                    Contact lists
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Technical Details */}
          <div className="mb-32">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Technical Details</h2>
            <p className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">
              Built with modern web standards for reliability and performance.
            </p>

            <div className="bg-gray-50 rounded-xl p-8 border border-gray-200 max-w-4xl mx-auto text-left">
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-gray-900 mb-2">Cascading Avatar Sources</h4>
                  <p className="text-gray-600 text-sm">
                    • <strong>BIMI:</strong> Company logos via Brand Indicators (2s timeout)
                    <br />
                    • <strong>Gravatar:</strong> SHA-256 hashed email lookups (3s timeout)
                    <br />
                    • <strong>unavatar.io:</strong> GitHub, Twitter, Google aggregation (3s timeout)
                    <br />
                    • <strong>Generated:</strong> Beautiful initials via useravatar.vercel.app
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 mb-2">Caching Strategy</h4>
                  <p className="text-gray-600 text-sm">
                    • Browser cache: 24 hours (max-age=86400)
                    <br />
                    • CDN cache: 24 hours (s-maxage=86400)
                    <br />
                    • Stale-while-revalidate: 7 days (604800)
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 mb-2">Image Quality</h4>
                  <p className="text-gray-600 text-sm">
                    • BIMI: Vector logos (SVG) from company domains
                    <br />
                    • Gravatar: 500×500px raster images
                    <br />
                    • unavatar.io: High-quality profile pictures
                    <br />
                    • Generated: 500×500px with Inter font
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 mb-2">Performance</h4>
                  <p className="text-gray-600 text-sm">
                    • Runs on Vercel Edge Network
                    <br />
                    • Global CDN distribution
                    <br />
                    • Parallel timeout handling
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Start Using the Free Avatar API</h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              No signup required. Just start using the API endpoint in your application today.
            </p>
            
            <div className="inline-flex flex-col items-center gap-4 mb-6">
              <Button variant="primary" size="lg" asChild>
                <a href="#usage">
                  View API Documentation
                  <ArrowBoldRight width="12" height="12" className="ml-2" />
                </a>
              </Button>
              
              <p className="text-sm text-gray-500">
                Or explore our other free tools:
              </p>
              
              <div className="flex flex-wrap gap-3 justify-center">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/bimi-generator">BIMI Generator</Link>
                </Button>
                {session && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/add">Dashboard</Link>
                  </Button>
                )}
              </div>
            </div>

            <p className="text-sm text-gray-500">
              ✓ No registration ✓ No limits ✓ No tracking ✓ Always free
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
            <a href="https://twitter.com/intent/follow?screen_name=inboundemail" className="hover:text-gray-700 transition-colors flex items-center gap-1">Contact us on
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

