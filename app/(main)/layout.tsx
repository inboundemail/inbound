"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { NavigationProvider } from "@/contexts/navigation-context"
import { LoadingSpinner } from "@/components/loading-spinner"
import { CommandBar, useCommandBar } from "@/components/command-bar"
import { UnpaidWelcomeRedirect } from "@/components/unpaid-welcome-redirect"

import { EnhancedPageTransition } from "@/components/page-transition"
import { useSession } from "@/lib/auth/auth-client"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const { open, setOpen } = useCommandBar()
  
  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login")
    }
  }, [session, isPending, router])

  // Show loading state while checking authentication
  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    )
  }

  // Don't render anything if not authenticated (will redirect)
  if (!session) {
    return null
  }

  return (
    <NavigationProvider>
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset>
          <UnpaidWelcomeRedirect />
          <EnhancedPageTransition direction="fade" className="h-full">
            {children}
          </EnhancedPageTransition>
        </SidebarInset>
      </SidebarProvider>
      <CommandBar open={open} onOpenChange={setOpen} />
      <Toaster />
    </NavigationProvider>
  )
}
