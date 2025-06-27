"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { LoginForm } from "@/components/login-form"
import InboundIcon from "@/components/InboundIcon"
import { useSession } from "@/lib/auth-client"

export default function LoginPage() {
  const { data: session, isPending } = useSession()
  const router = useRouter()

  useEffect(() => {
    // If user is already logged in, redirect to dashboard
    if (session && !isPending) {
      router.push("/mail")
    }
  }, [session, isPending, router])

  // Show loading state while checking session
  if (isPending) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-gradient-to-br from-purple-600 via-purple-700 to-purple-900">
        <div className="flex items-center gap-2 text-white">
          <InboundIcon className="w-7 h-7" variant="white" />
          <span className="text-xl">loading...</span>
        </div>
      </div>
    )
  }

  // If user is logged in, don't render the login form (will redirect)
  if (session) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-700 to-purple-900 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0">
        {/* Floating orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-pink-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-indigo-400/20 rounded-full blur-3xl animate-pulse delay-500"></div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:30px_30px] opacity-20"></div>
      </div>

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo section */}
          <Link href="/">
            <div className="text-center mb-8">
              <div className="flex justify-center items-center gap-2 mb-4">
                <img src="/inbound-logo-3.png" alt="Inbound Logo" className="w-8 h-8" />
                <span className="text-4xl font-bold text-white">inbound</span>
              </div>
              <p className="text-purple-200 text-lg">welcome back</p>
            </div>
          </Link>

          {/* Login card */}
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20">
            <LoginForm />
          </div>

          {/* Footer */}
          <div className="text-center mt-8">
            <p className="text-purple-200 text-sm">
              email infrastructure, redefined
            </p>
          </div>
        </div>
      </div>

      {/* Additional decorative elements */}
      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-purple-900/50 to-transparent"></div>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-400/20 to-transparent"></div>
    </div>
  )
}
