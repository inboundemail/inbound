'use server'

import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"

/**
 * Check if the current user has admin role
 * @returns Promise<boolean> - true if user is admin, false otherwise
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })
    
    return session?.user?.role === 'admin'
  } catch (error) {
    console.error('Error checking admin status:', error)
    return false
  }
}

/**
 * Check if a user role is admin
 * @param role - The user role to check
 * @returns boolean - true if role is admin, false otherwise
 */
export async function isAdminRole(role: string | null | undefined): Promise<boolean> {
  return role === 'admin'
}

/**
 * Get the current session on the server side
 * @returns Promise<Session | null> - The current session or null
 */
export async function getCurrentSession() {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    })
    
    return session
  } catch (error) {
    console.error('Error getting current session:', error)
    return null
  }
}

/**
 * Require admin role - throws error if user is not admin
 * @throws Error if user is not admin
 */
export async function requireAdmin(): Promise<void> {
  const isAdmin = await isCurrentUserAdmin()
  
  if (!isAdmin) {
    throw new Error('Admin access required')
  }
} 