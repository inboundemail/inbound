import { LucideIcon, BarChart3Icon, InboxIcon, WebhookIcon, ActivityIcon, CreditCardIcon, SettingsIcon, HelpCircleIcon, ShieldCheckIcon } from "lucide-react"

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
      title: "Email Addresses",
      url: "/emails",
      icon: InboxIcon,
      description: "Manage your email addresses"
    },
    {
      title: "Webhooks",
      url: "/webhooks",
      icon: WebhookIcon,
      description: "Configure webhook endpoints"
    },
    {
      title: "Analytics",
      url: "/analytics",
      icon: ActivityIcon,
      description: "View detailed analytics"
    },
    {
      title: "Subscription",
      url: "/subscription",
      icon: CreditCardIcon,
      description: "Manage your subscription"
    },
  ],
  secondary: [
    {
      title: "Settings",
      url: "/settings",
      icon: SettingsIcon,
      description: "Account and app settings"
    },
    {
      title: "Documentation",
      url: "/docs",
      icon: HelpCircleIcon,
      description: "API documentation and guides"
    },
    {
      title: "API Status",
      url: "/status",
      icon: ShieldCheckIcon,
      description: "Service status and uptime"
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

  // Check secondary navigation items
  const secondaryItem = navigationConfig.secondary.find(item => 
    item.url === pathname || item.url === `/${firstSegment}`
  )
  if (secondaryItem) return secondaryItem.title

  // Default fallback - capitalize first segment
  if (firstSegment) {
    return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1)
  }

  return "Dashboard"
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