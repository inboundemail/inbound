"use client"

import * as React from "react"
import { MailIcon } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar"
import { TeamSwitcher } from "./ui/team-switcher"
import inboundData from "@/lib/data.json"
import { navigationConfig } from "@/lib/navigation"

const data = {
  user: inboundData.user,
  navMain: navigationConfig.main,
  navSecondary: navigationConfig.secondary,
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <TeamSwitcher teams={[{
            name: "Inbound",
            logo: MailIcon,
            plan: inboundData.user.plan,
          }]} />
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
