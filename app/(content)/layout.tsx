import SiteHeader from "@/components/site-header"
import { ReactNode } from "react"

interface ContentLayoutProps {
  children: ReactNode
}

export default function ContentLayout({ children }: ContentLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="flex-1">
        <SiteHeader />
        {children}
      </main>
    </div>  
  )
}

