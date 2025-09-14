import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/auth'
import { getDefaultDubDomain, setDefaultDubDomain } from '@/lib/dub'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const current = await getDefaultDubDomain(session.user.id)
  return NextResponse.json(current)
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { id?: string | null; slug?: string | null }
  await setDefaultDubDomain(session.user.id, { id: body.id ?? null, slug: body.slug ?? null })
  return NextResponse.json({ success: true })
}


