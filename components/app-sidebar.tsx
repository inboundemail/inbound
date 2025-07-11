"use client"

import * as React from "react"
import Envelope2 from "@/components/icons/envelope-2"
import Calendar2 from "@/components/icons/calendar-2"
import Link from "next/link"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { HistoricalStatusCard } from "@/components/historical-status-card"
import { FeedbackDialog } from "@/components/feedback-dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { TeamSwitcher } from "./ui/team-switcher"
import { useSession } from "@/lib/auth/auth-client"
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
        <SidebarMenu className="mb-4 mt-2">
          <Link href="/">
            <TeamSwitcher
              enabled={false}
              teams={[{
                name: "Inbound",
                logo: Envelope2,
                plan: userData.plan,

              }]} />
          </Link>
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
        <SidebarGroup className={`${data.navSecondary.length > 0 ? 'mt-4' : 'mt-auto'}`}>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <FeedbackDialog />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Book a Call" asChild>
                  <a href="https://cal.inbound.new" target="_blank" rel="noopener noreferrer">
                    <Calendar2 className="h-4 w-4" />
                    <span>Book a Call</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Show Onboarding" asChild>
                  <Link href="/onboarding">
                    <Envelope2 className="h-4 w-4" />
                    <span>Show Onboarding</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
