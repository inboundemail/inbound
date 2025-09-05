"use client"

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { NavigationItem, getPageTitleFromUrl, getNavigationItemFromUrl, generateDocumentTitle } from '@/lib/navigation'

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
  
  // Memoize expensive computations to prevent unnecessary recalculations
  const currentItem = useMemo(() => getNavigationItemFromUrl(pathname), [pathname])
  const defaultTitle = useMemo(() => getPageTitleFromUrl(pathname), [pathname])
  const currentTitle = customTitle || defaultTitle

  // Use useCallback to memoize the function
  const resetTitle = useCallback(() => setCustomTitle(null), [])

  // Update document title when current title changes
  useEffect(() => {
    document.title = generateDocumentTitle(currentTitle)
  }, [currentTitle])

  useEffect(() => {
    // Reset custom title when route changes
    setCustomTitle(null)
  }, [pathname])

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<NavigationContextType>(() => ({
    currentPath: pathname,
    currentTitle,
    currentItem,
    setCustomTitle,
    resetTitle,
  }), [pathname, currentTitle, currentItem, resetTitle])

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