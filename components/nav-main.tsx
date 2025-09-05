"use client"

import EnvelopePlus from "@/components/icons/envelope-plus"
import { OptimizedLink } from "@/components/optimized-link"

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
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const isActive = isNavigationItemActive(item.url, currentPath)
            return (
              <SidebarMenuItem key={item.title}>
                {isActive ? (
                  <SidebarMenuButton 
                    tooltip={item.title} 
                    isActive={true}
                    className="cursor-default opacity-80"
                  >
                    {item.icon && <item.icon className="h-4 w-4" />}
                    <span className="opacity-80">{item.title}</span>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton 
                    tooltip={item.title} 
                    asChild 
                    isActive={false}
                  >
                    <OptimizedLink href={item.url}>
                      {item.icon && (
                        <item.icon
                          className={`h-4 w-4 ${item.title === 'Inbound VIP' ? 'opacity-80' : 'opacity-50'} text-black dark:text-white`}
                        />
                      )}
                      <span className={`${item.title === 'Inbound VIP' ? 'opacity-80' : 'opacity-50'} text-black dark:text-white`}>{item.title}</span>
                    </OptimizedLink>
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
