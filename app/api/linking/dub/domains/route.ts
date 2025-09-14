import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/auth'
import { listDubDomains } from '@/lib/dub'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const domains = await listDubDomains(session.user.id)
    return NextResponse.json(domains)
  } catch (e: any) {
    // If missing scope, surface a specific error to guide UX
    const message = String(e?.message || '')
    const needsRelink = /scope|unauthorized|forbidden|insufficient/i.test(message)
    return NextResponse.json({ error: message || 'Failed to list domains', needsRelink }, { status: 400 })
  }
}


