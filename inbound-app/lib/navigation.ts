/**
 * Navigation Configuration
 * 
 * Centralized navigation system for the application that provides:
 * - Main, secondary, and admin navigation menu items
 * - Dynamic page title generation based on URL paths
 * - Active navigation state management
 * - Role-based access control for admin features
 * 
 * Used by components like AppSidebar, NavMain, NavSecondary, and the NavigationContext
 * to provide consistent navigation experience across the application.
 */
import Webhook from "@/components/icons/webhook"
import ChartActivity2 from "@/components/icons/chart-activity-2"
import Gear2 from "@/components/icons/gear-2"
import Shield2 from "@/components/icons/shield-2"
import Globe2 from "@/components/icons/globe-2"
import Cloud2 from "@/components/icons/cloud-2"
import Code2 from "@/components/icons/code-2"
import StackPerspective2 from "@/components/icons/stack-perspective-2"
import Crown from "@/components/icons/crown"

export interface NavigationItem {
  title: string
  url: string
  icon?: React.ComponentType<any>
  description?: string
  customTailwind?: string
  requiresFeatureFlag?: string // Optional feature flag requirement
}

export interface NavigationConfig {
  main: NavigationItem[]
  secondary: NavigationItem[]
  admin: NavigationItem[]
}

export const navigationConfig: NavigationConfig = {
  main: [
    {
      title: "Email Flow",
      url: "/logs",
      icon: StackPerspective2,
      description: "View email flow, delivery status, and routing details"
    },
    {
      title: "Domains and Addresses",
      url: "/emails",
      icon: Globe2,
      description: "Manage your email domains and addresses"
    },
    {
      title: "Endpoints",
      url: "/endpoints",
      icon: Webhook,
      description: "Manage webhook and email forwarding endpoints"
    },
    {
      title: "Analytics",
      url: "/analytics",
      icon: ChartActivity2,
      description: "View detailed analytics"
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Gear2,
      description: "Account and app settings"
    },
    {
      title: "Inbound VIP",
      url: "/vip",
      icon: Crown,
      description: "Manage your VIP email addresses",
      customTailwind: "text-yellow-500",
      requiresFeatureFlag: "vip"
    }
  ],
  secondary: [],
  admin: [
    {
      title: "Admin Panel",
      url: "/admin",
      icon: Shield2,
      description: "Administrative controls and user management"
    },
    {
      title: "SES Dashboard",
      url: "/admin/ses",
      icon: Cloud2,
      description: "AWS SES monitoring and metrics"
    },
    {
      title: "Lambda Logs",
      url: "/admin/lambda",
      icon: Code2,
      description: "Lambda function monitoring and logs"
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

/**
 * Check if user has a specific feature flag enabled
 */
export function hasFeatureFlag(flagName: string, featureFlags?: string | null): boolean {
  if (!featureFlags) return false
  
  try {
    const flags = JSON.parse(featureFlags) as string[]
    return Array.isArray(flags) && flags.includes(flagName)
  } catch {
    return false
  }
}

/**
 * Check if user has VIP access
 */
export function hasUserVipAccess(featureFlags?: string | null): boolean {
  return hasFeatureFlag('vip', featureFlags)
}

/**
 * Filter navigation items based on user's feature flags
 */
export function filterNavigationByFeatureFlags(
  items: NavigationItem[], 
  featureFlags?: string | null
): NavigationItem[] {
  return items.filter(item => {
    // If no feature flag is required, show the item
    if (!item.requiresFeatureFlag) return true
    
    // Check if user has the required feature flag
    return hasFeatureFlag(item.requiresFeatureFlag, featureFlags)
  })
} 