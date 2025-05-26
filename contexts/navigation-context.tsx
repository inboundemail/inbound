"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { NavigationItem, getPageTitleFromUrl, getNavigationItemFromUrl } from '@/lib/navigation'

interface NavigationContextType {
  currentPath: string
  currentTitle: string
  currentItem: NavigationItem | null
  setCustomTitle: (title: string) => void
  resetTitle: () => void
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined)

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [customTitle, setCustomTitle] = useState<string | null>(null)
  
  const currentItem = getNavigationItemFromUrl(pathname)
  const defaultTitle = getPageTitleFromUrl(pathname)
  const currentTitle = customTitle || defaultTitle

  const resetTitle = () => setCustomTitle(null)

  useEffect(() => {
    // Reset custom title when route changes
    setCustomTitle(null)
  }, [pathname])

  const value: NavigationContextType = {
    currentPath: pathname,
    currentTitle,
    currentItem,
    setCustomTitle,
    resetTitle,
  }

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const context = useContext(NavigationContext)
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider')
  }
  return context
} 