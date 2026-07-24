import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: episode } = await supabase
    .from('episodes')
    .select('id, share_token, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!episode) return NextResponse.json({ error: '节目不存在' }, { status: 404 })
  if (episode.status !== 'completed') {
    return NextResponse.json({ error: '仅已完成的节目可分享' }, { status: 400 })
  }

  if (episode.share_token) {
    return NextResponse.json({ share_token: episode.share_token })
  }

  const token = randomBytes(16).toString('hex')
  const { error } = await supabase
    .from('episodes')
    .update({ share_token: token })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ share_token: token })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('episodes')
    .update({ share_token: null })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
