"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { NavigationProvider } from "@/contexts/navigation-context"

import { EnhancedPageTransition } from "@/components/page-transition"
import { useSession } from "@/lib/auth/auth-client"
import { useRouter, usePathname } from "next/navigation"
import { useEffect } from "react"
import { useOnboardingStatusQuery } from "@/features/settings/hooks"

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  
  // Only fetch onboarding status if user is authenticated and not on onboarding page
  const shouldFetchOnboarding = !!session?.user && pathname !== '/onboarding'
  const { data: onboardingData, isLoading: isOnboardingLoading } = useOnboardingStatusQuery()

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login")
    }
  }, [session, isPending, router])

  // Check onboarding status and redirect if needed (only auto-redirect incomplete users)
  useEffect(() => {
    // Skip onboarding check if we're already on the onboarding page or still loading
    if (pathname === '/onboarding' || isPending || !session?.user) {
      return
    }

    // Only redirect if we have confirmed the user hasn't completed onboarding
    if (
      !isOnboardingLoading && 
      onboardingData?.success && 
      onboardingData.onboarding &&
      !onboardingData.onboarding.isCompleted
    ) {
      console.log('🎯 Redirecting to onboarding - user has not completed onboarding')
      router.push('/onboarding')
    }
  }, [session?.user?.id, isOnboardingLoading, onboardingData?.onboarding?.isCompleted, pathname, router, isPending])

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
    <NavigationProvider>
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset>
          <EnhancedPageTransition direction="fade" className="h-full">
            {children}
          </EnhancedPageTransition>
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </NavigationProvider>
  )
}
