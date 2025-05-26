"use client"

import { MailPlusIcon } from "lucide-react"
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
              <a href="/emails/new">
                <MailPlusIcon className="h-4 w-4" />
                <span>New Email Address</span>
              </a>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = isNavigationItemActive(item.url, currentPath)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton 
                  tooltip={item.title} 
                  asChild 
                  isActive={isActive}
                >
                  <Link href={item.url}>
                    {item.icon && <item.icon className="h-4 w-4" />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
