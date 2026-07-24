import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: episode, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !episode) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 获取步骤日志
  const { data: steps } = await supabase
    .from('episode_steps')
    .select('*')
    .eq('episode_id', id)
    .order('started_at', { ascending: true })

  return NextResponse.json({ ...episode, steps: steps || [] })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // 只允许更新 title 和 script
  const allowedFields: Record<string, unknown> = {}
  if (body.title !== undefined) allowedFields.title = body.title
  if (body.script !== undefined) {
    const { data: ep } = await supabase
      .from('episodes')
      .select('status, params')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
    if (!ep) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ep.status !== 'script_ready') {
      return NextResponse.json(
        { error: `Cannot edit script in status: ${ep.status}` },
        { status: 400 }
      )
    }
    const rewriteLock = (ep.params as Record<string, unknown> | null)?.rewrite_in_progress
    if (rewriteLock === true || (typeof rewriteLock === 'string' && rewriteLock.length > 0 && rewriteLock !== 'false')) {
      return NextResponse.json({ error: 'Cannot edit script while AI rewrite is running' }, { status: 409 })
    }
    allowedFields.script = body.script
  }

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('episodes')
    .update(allowedFields)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: episode } = await supabase
    .from('episodes')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!episode || episode.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('episodes')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Async cleanup of storage audio files (non-blocking)
  const prefix = `${user.id}/episodes/${id}/`
  supabase.storage
    .from('audio')
    .list(prefix)
    .then(({ data: files }) => {
      if (files && files.length > 0) {
        const paths = files.map(f => `${prefix}${f.name}`)
        supabase.storage.from('audio').remove(paths).catch(() => {})
      }
    })
    .catch(() => {})

  return NextResponse.json({ success: true })
}
