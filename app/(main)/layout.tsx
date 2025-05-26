import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { NavigationProvider } from "@/contexts/navigation-context"
import { ViewTransitions } from "next-view-transitions"
import { EnhancedPageTransition } from "@/components/page-transition"

export default function Layout({ children }: { children: React.ReactNode }) {

  return (
    <ViewTransitions>
      <NavigationProvider>
        <SidebarProvider>
          <AppSidebar variant="inset" />
          <SidebarInset>
            <SiteHeader />
            <EnhancedPageTransition direction="horizontal">
              {children}
            </EnhancedPageTransition>
          </SidebarInset>
        </SidebarProvider>
      </NavigationProvider>
    </ViewTransitions>
  )
}
