import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action, ids } = body as { action: 'delete' | 'regenerate'; ids: string[] }

  if (!action || !Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
    return NextResponse.json({ error: '参数无效（最多 50 条）' }, { status: 400 })
  }

  if (action === 'delete') {
    const { error } = await supabase
      .from('episodes')
      .delete()
      .in('id', ids)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: ids.length })
  }

  if (action === 'regenerate') {
    const results: string[] = []
    for (const id of ids) {
      const res = await fetch(`${request.nextUrl.origin}/api/episodes/${id}/regenerate`, {
        method: 'POST',
        headers: { cookie: request.headers.get('cookie') || '' },
      })
      if (res.ok) {
        const data = await res.json()
        results.push(data.id)
      }
    }
    return NextResponse.json({ ok: true, regenerated: results.length })
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 })
}
