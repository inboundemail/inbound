import { LucideIcon, BarChart3Icon, InboxIcon, WebhookIcon, ActivityIcon, CreditCardIcon, SettingsIcon, HelpCircleIcon, ShieldCheckIcon, PlusIcon, GlobeIcon } from "lucide-react"

export interface NavigationItem {
  title: string
  url: string
  icon?: LucideIcon
  description?: string
}

export interface NavigationConfig {
  main: NavigationItem[]
  secondary: NavigationItem[]
  admin: NavigationItem[]
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
      title: "Domains",
      url: "/emails",
      icon: GlobeIcon,
      description: "Manage your email domains and addresses"
    },
    {
      title: "Webhooks",
      url: "/webhooks",
      icon: WebhookIcon,
      description: "Manage webhook endpoints for email notifications"
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
  admin: [
    {
      title: "Admin Panel",
      url: "/admin",
      icon: ShieldCheckIcon,
      description: "Administrative controls and user management"
    },
  ],
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

  // Check admin navigation items
  const adminItem = navigationConfig.admin.find(item => 
    item.url === pathname || item.url === `/${firstSegment}`
  )
  if (adminItem) return adminItem.title

  // Check secondary navigation items
  const secondaryItem = navigationConfig.secondary.find(item => 
    item.url === pathname || item.url === `/${firstSegment}`
  )
  if (secondaryItem) return secondaryItem.title

  // Special cases for compound words
  if (firstSegment === 'addinbound') return 'Add Inbound Email'
  if (firstSegment === 'admin') return 'Admin Panel'
  
  // Default fallback - capitalize first segment
  return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1)
}

// Helper function to generate document title
export function generateDocumentTitle(pageTitle: string, baseTitle: string = "inbound"): string {
  if (pageTitle === "Dashboard") {
    return baseTitle
  }
  return `${pageTitle} | ${baseTitle}`
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

  // Check admin navigation items
  const adminItem = navigationConfig.admin.find(item => 
    item.url === pathname || item.url === `/${firstSegment}`
  )
  if (adminItem) return adminItem

  // Check secondary navigation items
  const secondaryItem = navigationConfig.secondary.find(item => 
    item.url === pathname || item.url === `/${firstSegment}`
  )
  if (secondaryItem) return secondaryItem

  return null
}

/**
 * Check if a navigation item is active based on the current path
 */
export function isNavigationItemActive(itemUrl: string, currentPath: string): boolean {
  // Exact match for root paths
  if (itemUrl === '/' && currentPath === '/') {
    return true
  }
  
  // For non-root paths, check if current path starts with the item URL
  if (itemUrl !== '/' && currentPath.startsWith(itemUrl)) {
    return true
  }
  
  return false
}

/**
 * Check if user has admin role
 */
export function isUserAdmin(role?: string): boolean {
  return role === 'admin'
} 