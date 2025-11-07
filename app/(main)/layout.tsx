"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { NavigationProvider } from "@/contexts/navigation-context"
import { LoadingSpinner } from "@/components/loading-spinner"
import { CommandBar, useCommandBar } from "@/components/command-bar"

import { EnhancedPageTransition } from "@/components/page-transition"
import { useSession } from "@/lib/auth/auth-client"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending, refetch } = useSession()
  const router = useRouter()
  const { open, setOpen } = useCommandBar()
  
  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login")
    }
  }, [session, isPending, router])

  // Ensure session is fresh after navigation from login
  useEffect(() => {
    // If we just logged in (check for query param or recent navigation)
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.get('from') === 'login' && session) {
      // Refetch session to ensure all data is loaded
      refetch()
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [session, refetch])

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
