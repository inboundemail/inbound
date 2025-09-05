"use client"

import * as React from "react"
import Envelope2 from "@/components/icons/envelope-2"
import Calendar2 from "@/components/icons/calendar-2"
import Link from "next/link"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
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
import { navigationConfig, isUserAdmin, filterNavigationByFeatureFlags } from "@/lib/navigation"
import Book2 from "./icons/book-2"
import { Collapsible } from "./ui/collapsible"
import { Button } from "./ui/button"
import EnvelopePlus from "./icons/envelope-plus"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession()

  // Don't render sidebar if no session (this shouldn't happen due to layout protection)
  if (!session?.user) {
    return null
  }

  const userData = {
    name: session.user.name || "User",
    email: session.user.email,
    avatar: session.user.image || "",
    plan: "Pro" // You can get this from subscription data later
  }

  // Check if user is admin
  const userIsAdmin = isUserAdmin(session.user.role || "user")

  // Filter navigation items based on user's feature flags
  const filteredMainNav = filterNavigationByFeatureFlags(
    navigationConfig.main,
    (session.user as any).featureFlags || null
  )

  const filteredFeaturesNav = filterNavigationByFeatureFlags(
    navigationConfig.features,
    (session.user as any).featureFlags || null
  )

  const data = {
    user: userData,
    navMain: filteredMainNav,
    navFeatures: filteredFeaturesNav,
    navSecondary: navigationConfig.secondary,
    navAdmin: userIsAdmin ? navigationConfig.admin : [],
  }

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader className="pt-2">
        {/* User card at the top (per Figma) */}
        <NavUser user={data.user} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Button
                  variant="primary"
                  // className="w-full rounded-[9px] bg-[#8161FF] text-white shadow-[0_-1px_1.25px_0_rgba(0,0,0,0.25)_inset,1px_1.25px_2.3px_0_rgba(255,255,255,0.26)_inset] hover:bg-[#8161FF] active:bg-[#7758ff] px-[18px] dark:bg-[#4a0198] dark:hover:bg-[#5201a8] dark:active:bg-[#3e017f] dark:shadow-[1px_1.25px_2.3px_0px_inset_rgba(255,255,255,0.1)]"
                  asChild
                >
                  <a href="/add" className="flex items-center gap-2 w-full justify-between">
                    <span className="group-data-[collapsible=icon]:hidden">new inbound</span>
                    <EnvelopePlus className="h-4 w-4" />
                  </a>
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {/* GENERAL section */}

        <div className="px-2 mt-1">
          <span className="ml-2 text-[13px] font-semibold tracking-[0.08em] text-foreground/30">GENERAL</span>
        </div>
        <NavMain items={data.navMain} />

        {/* FEATURES section */}
        {data.navFeatures.length > 0 && (
          <div className="mt-4">
            <div className="px-2 mb-1">
              <span className="ml-2 text-[13px] font-semibold tracking-[0.08em] text-foreground/30">FEATURES</span>
            </div>
            <NavSecondary items={data.navFeatures} />
          </div>
        )}

        {/* ADMIN section */}
        {data.navAdmin.length > 0 && (
          <div className="mt-4">
            <div className="px-2 mb-1">
              <span className="ml-2 text-[13px] font-semibold tracking-[0.08em] text-foreground/30">ADMIN</span>
            </div>
            <NavSecondary items={data.navAdmin} />
          </div>
        )}

        {/* Secondary nav stays above the bottom links if present */}
        {data.navSecondary.length > 0 && (
          <NavSecondary items={data.navSecondary} className="mt-2" />
        )}

        {/* Bottom quick links (Docs, Feedback, Book a Call, Onboarding) */}
        <SidebarGroup className={`${data.navSecondary.length > 0 ? 'mt-4' : 'mt-auto'}`}>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Docs" asChild>
                  <a href="https://docs.inbound.new" target="_blank" rel="noopener noreferrer">
                    <Book2 className="h-4 w-4" />
                    <span>Docs</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
        {/* Brand/logo at the very bottom (per Figma) */}
        <SidebarMenu className="mb-2 mt-2">

          <TeamSwitcher
            enabled={false}
            teams={[{
              name: "Inbound",
              logo: Envelope2,
              plan: userData.plan,
            }]}
          />

        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
