"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { GalleryVerticalEnd } from "lucide-react"

import { LoginForm } from "@/components/login-form"
import { Button } from "@/components/ui/button"
import InboundIcon from "@/components/InboundIcon"
import { useSession } from "@/lib/auth-client"

export default function LoginPage() {
  const { data: session, isPending } = useSession()
  const router = useRouter()

  useEffect(() => {
    // If user is already logged in, redirect to dashboard
    if (session && !isPending) {
      router.push("/dashboard")
    }
  }, [session, isPending, router])

  // Show loading state while checking session
  if (isPending) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <div className="flex items-center gap-2">
          <InboundIcon className="w-7 h-7" variant="white" />
          <span className="text-xl">Loading...</span>
        </div>
      </div>
    )
  }

  // If user is logged in, don't render the login form (will redirect)
  if (session) {
    return null
  }

  return (
    <div className="relative min-h-svh">
      {/* Background image - full screen */}
      <div className="absolute inset-0 hidden lg:block">
        <img
          src="/login.png"
          alt="Image"
          className="h-full w-full object-cover blur-sm scale-110 dark:brightness-[0.2] dark:grayscale"
        />
      </div>
      
      {/* Login form overlay */}
      <div className="relative z-10 grid min-h-svh lg:grid-cols-2 py-2">
        <div className="flex flex-col gap-4 p-6 md:p-10 lg:rounded-r-3xl lg:bg-white/95 lg:backdrop-blur-sm">
          <div className="flex justify-center gap-2 md:justify-start">
            <a href="/" className="flex items-center gap-2">
              <img src="/inbound-logo-3.png" alt="Inbound Logo" className="w-7 h-7 mr-1" />
              <span className="text-3xl font-bold -ml-1">inbound</span>
            </a>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-xs">
              <LoginForm />
            </div>
          </div>
        </div>
        <div className="hidden lg:block"></div>
      </div>
    </div>
  )
}
