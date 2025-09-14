import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/auth'
import { ensureInboundFolder, getDefaultDubFolder, setDefaultDubFolder } from '@/lib/dub'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const ensureInbound = url.searchParams.get('ensureInbound') === 'true'
  if (ensureInbound) {
    try {
      const inbound = await ensureInboundFolder(session.user.id)
      await setDefaultDubFolder(session.user.id, { id: inbound.id, name: inbound.name })
    } catch {}
  }
  const current = await getDefaultDubFolder(session.user.id)
  return NextResponse.json(current)
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { id?: string | null; name?: string | null; ensureInbound?: boolean }
  if (body.ensureInbound) {
    try {
      const inbound = await ensureInboundFolder(session.user.id)
      await setDefaultDubFolder(session.user.id, { id: inbound.id, name: inbound.name })
      return NextResponse.json({ success: true })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || 'Failed to ensure inbound folder' }, { status: 400 })
    }
  }
  await setDefaultDubFolder(session.user.id, { id: body.id ?? null, name: body.name ?? null })
  return NextResponse.json({ success: true })
}


