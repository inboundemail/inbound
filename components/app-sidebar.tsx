"use client"

import * as React from "react"
import { MailIcon } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { HistoricalStatusCard } from "@/components/historical-status-card"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar"
import { TeamSwitcher } from "./ui/team-switcher"
import { useSession } from "@/lib/auth-client"
import { navigationConfig, isUserAdmin } from "@/lib/navigation"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession()

  // Don't render sidebar if no session (this shouldn't happen due to layout protection)
  if (!session?.user) {
    return null
  }

  const userData = {
    name: session.user.name || "User",
    email: session.user.email,
    avatar: session.user.image || "/avatars/default.jpg",
    plan: "Pro" // You can get this from subscription data later
  }

  // Check if user is admin
  const userIsAdmin = isUserAdmin(session.user.role || "user")

  const data = {
    user: userData,
    navMain: navigationConfig.main,
    navSecondary: navigationConfig.secondary,
    navAdmin: userIsAdmin ? navigationConfig.admin : [],
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu className="mb-4">
          <TeamSwitcher
            enabled={false}
            teams={[{
              name: "Inbound",
              logo: MailIcon,
              plan: userData.plan,

            }]} />
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        {data.navAdmin.length > 0 && (
          <div className="mt-4">
            <span className="text-sm text-muted-foreground ml-2">Admin</span>
            <NavSecondary items={data.navAdmin} />
          </div>
        )}
        {data.navSecondary.length > 0 && (
          <NavSecondary items={data.navSecondary} className="mt-auto" />
        )}
        {/* <div className={`mb-2 px-3 ${data.navSecondary.length > 0 ? 'mt-4' : 'mt-auto'}`}>
          <HistoricalStatusCard />
        </div> */}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
