"use client"

import { usePageTitle } from '@/hooks/use-page-title'

export default function SettingsPage() {
  // The page title will automatically be set to "Settings" based on the navigation config
  
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
      </div>
      <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">Settings</h2>
          <p className="text-muted-foreground">
            Manage your account settings, preferences, and application configuration.
          </p>
        </div>
      </div>
    </div>
  )
} 