"use client"
import * as React from "react"
import DoubleChevronDown from "@/components/icons/double-chevron-down"
import CirclePlus from "@/components/icons/circle-plus"
import { DotLottiePlayer, Controls } from "@dotlottie/react-player"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
export function TeamSwitcher({
  teams,
  enabled,
}: {
  teams: {
    name: string
    logo: React.ElementType
    plan: string

  }[],
  enabled: boolean
}) {
  const { isMobile } = useSidebar()
  const [activeTeam, setActiveTeam] = React.useState(teams[0])
  const playerRef = React.useRef<any>(null)
  const toggleTheme = React.useCallback(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    const isDark = root.classList.contains("dark")
    if (isDark) {
      root.classList.remove("dark")
      try { localStorage.setItem("theme", "light") } catch {}
    } else {
      root.classList.add("dark")
      try { localStorage.setItem("theme", "dark") } catch {}
    }
  }, [])
  if (!activeTeam) {
    return null
  }

  if (!enabled) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center justify-center gap-2 w-full mx-auto">
            <button
              type="button"
              aria-label="Play inbound animation"
              className="h-12 w-12 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              onClick={() => {
                const p = playerRef.current
                if (!p) return
                try { p.seek?.(0) } catch {}
                p.play?.()
                toggleTheme()
              }}
            >
              <DotLottiePlayer
                ref={playerRef}
                src="/inbound.lottie"
                style={{ width: 48, height: 48 }}
                autoplay={true}
                loop={false}
                className="pointer-events-none"
              />
            </button>
            <div className="text-left text-xl leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold text-3xl -ml-2" style={{ fontFamily: 'Outfit' }}>
                inbound
              </span>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground hover:!bg-gray-100 hover:!text-gray-900"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <activeTeam.logo className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">
                  {activeTeam.name}
                </span>
                <span className="truncate text-xs">{activeTeam.plan}</span>
              </div>
              <DoubleChevronDown className="ml-auto group-data-[collapsible=icon]:hidden" width="16" height="16" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Teams
            </DropdownMenuLabel>
            {teams.map((team, index) => (
              <DropdownMenuItem
                key={team.name}
                onClick={() => setActiveTeam(team)}
                className="gap-2 p-2 hover:!bg-gray-100 hover:!text-gray-900"
              >
                <div className="flex size-6 items-center justify-center rounded-sm border">
                  <team.logo className="size-4 shrink-0" />
                </div>
                {team.name}
                <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2 hover:!bg-gray-100 hover:!text-gray-900">
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <CirclePlus width="16" height="16" />
              </div>
              <div className="font-medium text-muted-foreground">Add team</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}