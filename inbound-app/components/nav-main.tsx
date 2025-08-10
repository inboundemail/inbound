"use client"

import EnvelopePlus from "@/components/icons/envelope-plus"
import { Link } from "next-view-transitions"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NavigationItem, isNavigationItemActive } from "@/lib/navigation"
import { useNavigation } from "@/contexts/navigation-context"

export function NavMain({
  items,
}: {
  items: NavigationItem[]
}) {
  const { currentPath } = useNavigation()
  const [loadingItem, setLoadingItem] = useState<string | null>(null)

  const handleNavClick = (url: string) => {
    setLoadingItem(url)
    // Reset loading state after navigation is likely complete
    setTimeout(() => setLoadingItem(null), 300)
  }

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <Button
              variant="primary"
              className="w-full transition-transform hover:scale-[1.02]"
              asChild
            >
              <a href="/add" className="flex items-center gap-2">
                <EnvelopePlus className="h-4 w-4" />
                <span className="group-data-[collapsible=icon]:hidden">new inbound</span>
              </a>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
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
                    tooltip={item.title} 
                    asChild 
                    isActive={false}
                    className={`transition-all duration-200 hover:translate-x-1 ${
                      isLoading ? 'opacity-60 animate-pulse' : ''
                    }`}
                  >
                    <Link 
                      href={item.url}
                      onClick={() => handleNavClick(item.url)}
                    >
                      {item.icon && (
                        <item.icon 
                          className={`h-4 w-4 ${item.customTailwind} ${
                            isLoading ? 'animate-pulse' : ''
                          }`} 
                        />
                      )}
                      <span className={`${item.customTailwind} ${
                        isLoading ? 'animate-pulse' : ''
                      }`}>
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
