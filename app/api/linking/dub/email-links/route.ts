import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/auth'
import { getEnableDubLinksForEmails, setEnableDubLinksForEmails } from '@/lib/dub'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const enabled = await getEnableDubLinksForEmails(session.user.id)
  return NextResponse.json({ enabled })
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { enabled } = await req.json().catch(() => ({ enabled: false })) as { enabled: boolean }
  await setEnableDubLinksForEmails(session.user.id, !!enabled)
  return NextResponse.json({ success: true })
}


