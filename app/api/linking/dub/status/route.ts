import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/auth'
import { db } from '@/lib/db/index'
import { dubIntegrations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ linked: false }, { status: 200 })

  const rows = await db.select().from(dubIntegrations).where(eq(dubIntegrations.userId, session.user.id)).limit(1)
  const integ = rows[0]
  if (!integ) return NextResponse.json({ linked: false }, { status: 200 })

  return NextResponse.json({
    linked: true,
    workspaceName: integ.dubWorkspaceName || null,
    updatedAt: integ.updatedAt?.toISOString?.() || null,
  })
}


