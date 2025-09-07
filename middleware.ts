import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import { user } from '@/lib/db/auth-schema'
import { eq } from 'drizzle-orm'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Don't run middleware for certain paths
  const isPublicPath = pathname.startsWith('/api') || 
                      pathname.startsWith('/_next') ||
                      pathname.startsWith('/favicon') ||
                      pathname.startsWith('/login') ||
                      pathname.startsWith('/suspended') ||
                      pathname === '/' ||
                      pathname.startsWith('/pricing') ||
                      pathname.startsWith('/privacy') ||
                      pathname.startsWith('/terms') ||
                      pathname.startsWith('/docs') ||
                      pathname.startsWith('/changelog')

  if (isPublicPath) {
    return NextResponse.next()
  }

  try {
    // Get the session
    const session = await auth.api.getSession({
      headers: request.headers
    })

    if (!session?.user?.id) {
      // No session, redirect to login
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Check if user is suspended
    const userData = await db.select({
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires
    }).from(user).where(eq(user.id, session.user.id)).limit(1)

    if (userData.length === 0) {
      // User not found, redirect to login
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const userInfo = userData[0]
    
    // Check if user is banned
    if (userInfo.banned) {
      // If ban has an expiration date, check if it's still active
      if (userInfo.banExpires && new Date() > userInfo.banExpires) {
        // Ban has expired, allow through (ideally we'd clear the ban flag here)
        return NextResponse.next()
      } else {
        // User is currently banned, redirect to suspended page
        if (pathname !== '/suspended') {
          return NextResponse.redirect(new URL('/suspended', request.url))
        }
      }
    }

    return NextResponse.next()
  } catch (error) {
    console.error('Middleware error:', error)
    // On error, allow the request to continue to avoid breaking the app
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
