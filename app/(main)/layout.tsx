"use client"

import { AppSidebar } from "@/components/app-sidebar"
import SiteHeader from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { NavigationProvider } from "@/contexts/navigation-context"
import { ViewTransitions } from "next-view-transitions"
import { EnhancedPageTransition } from "@/components/page-transition"
import { useSession } from "@/lib/auth/auth-client"
import { useRouter, usePathname } from "next/navigation"
import { useEffect } from "react"
import { useOnboardingStatusQuery } from "@/features/settings/hooks"

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  
  // Only fetch onboarding status if user is authenticated
  const { data: onboardingData, isLoading: isOnboardingLoading } = useOnboardingStatusQuery()

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login")
    }
  }, [session, isPending, router])

  // Check onboarding status and redirect if needed (only auto-redirect incomplete users)
  useEffect(() => {
    if (
      !isPending && 
      !isOnboardingLoading && 
      session?.user && 
      onboardingData?.success && 
      onboardingData.onboarding &&
      !onboardingData.onboarding.isCompleted &&
      pathname !== '/onboarding'
    ) {
      console.log('🎯 Redirecting to onboarding - user has not completed onboarding')
      router.push('/onboarding')
    }
  }, [session, isPending, isOnboardingLoading, onboardingData, pathname, router])

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
