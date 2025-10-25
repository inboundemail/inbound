import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/auth'

export async function middleware(request: NextRequest) {
  // Check if the request is for an admin route
  if (request.nextUrl.pathname.startsWith('/admin')) {
    try {
      // Get the session from the request
      const session = await auth.api.getSession({
        headers: request.headers
      })

      // If no session, redirect to login
      if (!session?.user?.id) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
        return NextResponse.redirect(loginUrl)
      }

      // If user is not admin, redirect to main app
      if (session.user.role !== 'admin') {
        const logsUrl = new URL('/logs', request.url)
        return NextResponse.redirect(logsUrl)
      }

      // User is admin, allow access
      return NextResponse.next()
    } catch (error) {
      console.error('Middleware auth error:', error)
      // On error, redirect to login for security
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // For non-admin routes, continue normally
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all admin routes:
     * - /admin
     * - /admin/anything
     */
    '/admin/:path*'
  ]
}