import { LucideIcon, BarChart3Icon, InboxIcon, WebhookIcon, ActivityIcon, CreditCardIcon, SettingsIcon, HelpCircleIcon, ShieldCheckIcon, PlusIcon } from "lucide-react"

export interface NavigationItem {
  title: string
  url: string
  icon?: LucideIcon
  description?: string
}

export interface NavigationConfig {
  main: NavigationItem[]
  secondary: NavigationItem[]
}

export const navigationConfig: NavigationConfig = {
  main: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: BarChart3Icon,
      description: "Overview and analytics"
    },
    {
      title: "Addresses & Domains",
      url: "/emails",
      icon: InboxIcon,
      description: "Manage your email addresses"
    },
    {
      title: "Analytics",
      url: "/analytics",
      icon: ActivityIcon,
      description: "View detailed analytics"
    },
    {
      title: "Settings",
      url: "/settings",
      icon: SettingsIcon,
      description: "Account and app settings"
    },
  ],
  secondary: [],
}

// Helper function to get page title from URL
export function getPageTitleFromUrl(pathname: string): string {
  // Remove leading slash and split by slash
  const segments = pathname.replace(/^\//, '').split('/')
  const firstSegment = segments[0]

  // Check main navigation items
  const mainItem = navigationConfig.main.find(item => 
    item.url === pathname || item.url === `/${firstSegment}`
  )
  if (mainItem) return mainItem.title

  // Check secondary navigation items
  const secondaryItem = navigationConfig.secondary.find(item => 
    item.url === pathname || item.url === `/${firstSegment}`
  )
  if (secondaryItem) return secondaryItem.title

  // Special cases for compound words
  if (firstSegment === 'addinbound') return 'Add Inbound Email'
  
  // Default fallback - capitalize first segment
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1)
}

// Helper function to generate document title
export function generateDocumentTitle(pageTitle: string, baseTitle: string = "Inbound"): string {
  if (pageTitle === "Dashboard") {
    return baseTitle
  }
  return `${pageTitle} - ${baseTitle}`
}

// Helper function to get navigation item from URL
export function getNavigationItemFromUrl(pathname: string): NavigationItem | null {
  const segments = pathname.replace(/^\//, '').split('/')
  const firstSegment = segments[0]

  // Check main navigation items
  const mainItem = navigationConfig.main.find(item => 
    item.url === pathname || item.url === `/${firstSegment}`
  )
  if (mainItem) return mainItem

  // Check secondary navigation items
  const secondaryItem = navigationConfig.secondary.find(item => 
    item.url === pathname || item.url === `/${firstSegment}`
  )
  if (secondaryItem) return secondaryItem

  return null
}

// Helper function to check if a navigation item is active
export function isNavigationItemActive(itemUrl: string, currentPath: string): boolean {
  if (itemUrl === currentPath) return true
  
  // For nested routes, check if current path starts with item URL
  if (currentPath.startsWith(itemUrl) && itemUrl !== '/') {
    return true
  }
  
  return false
} 