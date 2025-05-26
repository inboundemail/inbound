"use client"

import { usePageTitle } from '@/hooks/use-page-title'
import { useState, useEffect } from 'react'

export default function SubscriptionPage() {
  const [planName, setPlanName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Example of dynamic title based on data
  usePageTitle(
    isLoading 
      ? "Loading Subscription..." 
      : planName 
        ? `${planName} Plan` 
        : "Subscription",
    [isLoading, planName]
  )

  useEffect(() => {
    // Simulate loading subscription data
    const timer = setTimeout(() => {
      setPlanName("Pro")
      setIsLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
      </div>
      <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">
            {isLoading ? "Loading..." : `${planName} Subscription`}
          </h2>
          <p className="text-muted-foreground">
            Manage your subscription plan and billing information.
          </p>
        </div>
      </div>
    </div>
  )
} 