"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { NavigationProvider } from "@/contexts/navigation-context"
import { ViewTransitions } from "next-view-transitions"
import { EnhancedPageTransition } from "@/components/page-transition"
import { useSession } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login")
    }
  }, [session, isPending, router])

  // Show loading state while checking authentication
  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  // Don't render anything if not authenticated (will redirect)
  if (!session) {
    return null
  }

  return (
    <ViewTransitions>
      <NavigationProvider>
        <SidebarProvider>
          <AppSidebar variant="sidebar" />
          <SidebarInset>
            <SiteHeader />
            <EnhancedPageTransition direction="horizontal" className="h-full">
              {children}
            </EnhancedPageTransition>
          </SidebarInset>
        </SidebarProvider>
      </NavigationProvider>
      <Toaster />
    </ViewTransitions>
  )
}
