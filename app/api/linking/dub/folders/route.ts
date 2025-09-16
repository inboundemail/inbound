import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/auth'
import { ensureInboundFolder, listDubFolders } from '@/lib/dub'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const ensureInbound = url.searchParams.get('ensureInbound') === 'true'
  try {
    if (ensureInbound) {
      await ensureInboundFolder(session.user.id)
    }
    const folders = await listDubFolders(session.user.id)
    return NextResponse.json(folders)
  } catch (e: any) {
    const message = String(e?.message || '')
    const needsRelink = /scope|unauthorized|forbidden|insufficient/i.test(message)
    return NextResponse.json({ error: message || 'Failed to list folders', needsRelink }, { status: 400 })
  }
}


