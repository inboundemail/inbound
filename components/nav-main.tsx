"use client"

import EnvelopePlus from "@/components/icons/envelope-plus"
import { Link } from "next-view-transitions"

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
          <SidebarMenuItem className="flex items-center gap-2">
            <Button
              variant="primary"
              className="w-full"
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
                  >
                    <Link href={item.url}>
                      {item.icon && <item.icon className="h-4 w-4" />}
                      <span>{item.title}</span>
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
