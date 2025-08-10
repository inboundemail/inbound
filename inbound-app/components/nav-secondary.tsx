"use client"

import * as React from "react"
import { Link } from "next-view-transitions"
import { useState } from "react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NavigationItem, isNavigationItemActive } from "@/lib/navigation"
import { useNavigation } from "@/contexts/navigation-context"

export function NavSecondary({
  items,
  ...props
}: {
  items: NavigationItem[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { currentPath } = useNavigation()
  const [loadingItem, setLoadingItem] = useState<string | null>(null)

  const handleNavClick = (url: string) => {
    setLoadingItem(url)
    // Reset loading state after navigation is likely complete
    setTimeout(() => setLoadingItem(null), 300)
  }

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = isNavigationItemActive(item.url, currentPath)
            const isLoading = loadingItem === item.url
            return (
              <SidebarMenuItem key={item.title}>
                {isActive ? (
                  <SidebarMenuButton 
                    tooltip={item.title}
                    isActive={true}
                    className="cursor-default"
                  >
                    {item.icon && <item.icon className="h-4 w-4" />}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton 
                    asChild 
                    tooltip={item.title}
                    isActive={false}
                    className={`transition-all duration-200 hover:translate-x-1 ${
                      isLoading ? 'opacity-60 animate-pulse' : ''
                    }`}
                  >
                    <Link 
                      href={item.url} 
                      className="flex items-center gap-2"
                      onClick={() => handleNavClick(item.url)}
                    >
                      {item.icon && (
                        <item.icon 
                          className={`h-4 w-4 ${
                            isLoading ? 'animate-pulse' : ''
                          }`} 
                        />
                      )}
                      <span className={isLoading ? 'animate-pulse' : ''}>
                        {item.title}
                      </span>
                      {isLoading && (
                        <div className="ml-auto animate-spin rounded-full h-3 w-3 border border-primary border-t-transparent" />
                      )}
                    </Link>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
