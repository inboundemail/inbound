import { redirect } from "next/navigation"
import { getCurrentSession, isAdminRole } from "@/lib/auth/auth-utils"
import LambdaPageClient from './lambda-page-client'

export default async function LambdaPage() {
  // Check if user is authenticated and has admin role
  const session = await getCurrentSession()
  
  if (!session) {
    redirect("/login")
  }
  
  if (!isAdminRole(session.user.role)) {
    redirect("/logs")
  }

  return <LambdaPageClient />
}
