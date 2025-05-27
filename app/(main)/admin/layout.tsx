import { redirect } from "next/navigation"
import { getCurrentSession, isAdminRole } from "@/lib/auth-utils"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Check if user is authenticated and has admin role
  const session = await getCurrentSession()
  
  if (!session) {
    redirect("/login")
  }
  
  if (!isAdminRole(session.user.role)) {
    redirect("/dashboard")
  }

  return <>{children}</>
} 