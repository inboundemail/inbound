"use client";

import * as React from "react";
import Envelope2 from "@/components/icons/envelope-2";
import Calendar2 from "@/components/icons/calendar-2";
import Link from "next/link";
import { updateUserProfile } from "@/app/actions/primary";
import { toast } from "sonner";

import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { FeedbackDialog } from "@/components/feedback-dialog";
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
} from "@/components/ui/sidebar";
import { TeamSwitcher } from "./ui/team-switcher";
import { useSession } from "@/lib/auth/auth-client";
import {
  navigationConfig,
  isUserAdmin,
  filterNavigationByFeatureFlags,
} from "@/lib/navigation";
import Book2 from "./icons/book-2";
import { Collapsible } from "./ui/collapsible";
import { Button } from "./ui/button";
import EnvelopePlus from "./icons/envelope-plus";
import CirclePlay from "./icons/circle-play";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "./ui/card";
import { Input } from "./ui/input";
import { useQuery } from "@tanstack/react-query";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session, isPending, error, refetch } = useSession();
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);
  const maxRetries = 3;

  const handleUpdateProfile = async (formData: FormData) => {
    setIsUpdating(true);
    try {
      const result = await updateUserProfile(formData);
      
      if (result.error) {
        toast.error(result.error);
      } else if (result.success) {
        toast.success(result.message || "Name updated successfully!");
        window.location.reload();
      }
    } catch (error) {
      toast.error("Failed to update name. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  // Retry session fetch if it fails or session is missing
  React.useEffect(() => {
    if (!isPending && !session?.user && retryCount < maxRetries) {
      const timer = setTimeout(() => {
        console.log(`Retrying session fetch (attempt ${retryCount + 1}/${maxRetries})`);
        refetch();
        setRetryCount(prev => prev + 1);
      }, 500 * (retryCount + 1)); // Exponential backoff: 500ms, 1000ms, 1500ms
      
      return () => clearTimeout(timer);
    }
  }, [session?.user, isPending, retryCount, refetch]);

  // Show loading state while session is loading or retrying
  if (isPending || (!session?.user && retryCount < maxRetries)) {
    return (
      <Sidebar variant="inset" collapsible="icon" {...props}>
        <SidebarContent className="flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-2 text-sidebar-foreground/70">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sidebar-foreground"></div>
            <span className="text-sm">Loading sidebar...</span>
          </div>
        </SidebarContent>
      </Sidebar>
    );
  }

  // After max retries, show error state
  if (!session?.user) {
    return (
      <Sidebar variant="inset" collapsible="icon" {...props}>
        <SidebarContent className="flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-2 text-sidebar-foreground/70 text-center">
            <span className="text-sm">Unable to load sidebar</span>
            <Button 
              size="sm" 
              variant="secondary"
              onClick={() => {
                setRetryCount(0);
                refetch();
              }}
            >
              Retry
            </Button>
          </div>
        </SidebarContent>
      </Sidebar>
    );
  }

  // Get the user's active or trialing product to display in the sidebar
  const activeProduct = (session.user as any)?.products?.find(
    (p: any) => (p?.status === "active" || p?.status === "trialing") && !p?.canceled_at
  );
  
  const planName = activeProduct?.name
    ? activeProduct.name.charAt(0).toUpperCase() + activeProduct.name.slice(1)
    : "Free";

  const userData = {
    name: session.user.name || "User",
    email: session.user.email,
    avatar: session.user.image || "",
    plan: planName,
  };

  // Check if user is admin
  const userIsAdmin = isUserAdmin(session.user.role || "user");

  // Filter navigation items based on user's feature flags
  const filteredMainNav = filterNavigationByFeatureFlags(
    navigationConfig.main,
    (session.user as any).featureFlags || null
  );

  const filteredFeaturesNav = filterNavigationByFeatureFlags(
    navigationConfig.features,
    (session.user as any).featureFlags || null
  );

  const data = {
    user: userData,
    navMain: filteredMainNav,
    navFeatures: filteredFeaturesNav,
    navSecondary: navigationConfig.secondary,
    navAdmin: userIsAdmin ? navigationConfig.admin : [],
  };

  // Fetch upgrade banner content from Basehub-backed API
  const { data: bannerData } = useQuery<{ success: boolean; banner: { shown: boolean; title: string; body: string; linkText: string; link: string } }>(
    {
      queryKey: ["upgrade-banner"],
      queryFn: async () => {
        const res = await fetch("/api/ui/upgrade-banner", { cache: "no-store" })
        if (!res.ok) throw new Error("Failed to fetch banner")
        return res.json()
      },
      staleTime: 5 * 60 * 1000,
    }
  )

  // Determine if user is on free tier (no active product)
  const isFreeTier = !(session.user as any)?.products?.some?.((p: any) => p?.status === "active" || p?.status === "trialing")

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader className="pt-2">
        {/* User card at the top (per Figma) */}
        <NavUser user={data.user} />
      </SidebarHeader>
      <SidebarContent>
        {/* Name banner - takes priority over all other banners */}
        {!session.user.name ? (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <Card className="w-full rounded-xl border-sidebar-border bg-sidebar-accent">
              <CardContent className="p-3">
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-semibold text-sidebar-foreground">hey 👋, didn't catch your name...</div>
                  <form action={handleUpdateProfile} className="space-y-2">
                    <Input 
                      name="name" 
                      placeholder="Enter your name" 
                      required
                      minLength={1}
                      maxLength={255}
                      disabled={isUpdating}
                      className="text-sm"
                    />
                    <Button 
                      type="submit" 
                      size="sm"
                      variant="primary"
                      disabled={isUpdating}
                      className="mt-1 w-full"
                    >
                      {isUpdating ? "Updating..." : "Update"}
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          </SidebarGroup>
        ) : (
          /* Upgrade banner (Basehub-propagated), shown above GENERAL for free tier - only if name is set */
          isFreeTier && bannerData?.banner?.shown && (
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <Card className="w-full rounded-xl border-sidebar-border bg-sidebar-accent">
                <CardContent className="p-3">
                  <div className="flex flex-col gap-2">
                    <div className="text-sm font-semibold text-sidebar-foreground">{bannerData.banner.title}</div>
                    <div className="text-xs text-sidebar-foreground/70 leading-relaxed">
                      {bannerData.banner.body}
                    </div>
                    <div>
                      <Button asChild size="sm" variant="primary" className="mt-1 w-full">
                        <a href={bannerData.banner.link}>{bannerData.banner.linkText}</a>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </SidebarGroup>
          )
        )}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <Button
                  variant="primary"
                  // className="w-full rounded-[9px] bg-[#8161FF] text-white shadow-[0_-1px_1.25px_0_rgba(0,0,0,0.25)_inset,1px_1.25px_2.3px_0_rgba(255,255,255,0.26)_inset] hover:bg-[#8161FF] active:bg-[#7758ff] px-[18px] dark:bg-[#4a0198] dark:hover:bg-[#5201a8] dark:active:bg-[#3e017f] dark:shadow-[1px_1.25px_2.3px_0px_inset_rgba(255,255,255,0.1)]"
                  asChild
                >
                  <a
                    href="/add"
                    className="flex items-center gap-2 w-full justify-between group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                  >
                    <span className="group-data-[collapsible=icon]:hidden text-[13px] sm:text-[14px] truncate">
                      new inbound
                    </span>
                    <EnvelopePlus className="h-4 w-4 group-data-[collapsible=icon]:mx-0" />
                  </a>
                </Button>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* GENERAL section */}

        <div className="px-2 mt-1 group-data-[collapsible=icon]:hidden">
          <span className="ml-2 text-[13px] font-semibold tracking-[0.08em] text-sidebar-foreground/30">
            GENERAL
          </span>
        </div>
        <NavMain items={data.navMain} />

        {/* FEATURES section */}
        {data.navFeatures.length > 0 && (
          <div className="mt-4">
            <div className="px-2 mb-1 group-data-[collapsible=icon]:hidden">
              <span className="ml-2 text-[13px] font-semibold tracking-[0.08em] text-foreground/30">
                FEATURES
              </span>
            </div>
            <NavSecondary items={data.navFeatures} />
          </div>
        )}

        {/* ADMIN section */}
        {data.navAdmin.length > 0 && (
          <div className="mt-4">
            <div className="px-2 mb-1 group-data-[collapsible=icon]:hidden">
            <span className="ml-2 text-[13px] font-semibold tracking-[0.08em] text-sidebar-foreground/30">
                ADMIN
              </span>
            </div>
            <NavSecondary items={data.navAdmin} />
          </div>
        )}

        {/* Secondary nav stays above the bottom links if present */}
        {data.navSecondary.length > 0 && (
          <NavSecondary items={data.navSecondary} className="mt-2" />
        )}

        {/* Bottom quick links (Docs, Feedback, Book a Call, Onboarding) */}
        <SidebarGroup
          className={`${data.navSecondary.length > 0 ? "mt-4" : "mt-auto"}`}
        >
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Video Tutorial" asChild>
                  <a
                    href="https://youtu.be/MOi19cSQdRI"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <CirclePlay className="h-4 w-4" />
                    <span>Video Tutorial</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Docs" asChild>
                  <a
                    href="https://docs.inbound.new"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
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
                  <a
                    href="https://cal.inbound.new"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Calendar2 className="h-4 w-4" />
                    <span>Book a Call</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Show Onboarding" asChild>
                  <Link href="/onboarding-demo">
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
            teams={[
              {
                name: "Inbound",
                logo: Envelope2,
                plan: userData.plan,
              },
            ]}
          />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
