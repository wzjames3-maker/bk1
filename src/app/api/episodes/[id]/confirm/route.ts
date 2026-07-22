import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 原子地把 script_ready → confirming，避免与 AI 改稿同时开始。
  // 使用 admin client 做条件更新（等效于 confirm_episode_for_tts RPC）
  const admin = createAdminClient()
  const { data: updated, error: confirmError } = await admin
    .from('episodes')
    .update({ status: 'confirming' })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'script_ready')
    .select('id')
    .maybeSingle()

  if (confirmError) {
    return NextResponse.json({ error: `Unable to confirm episode: ${confirmError.message}` }, { status: 500 })
  }
  if (!updated) {
    return NextResponse.json(
      { error: 'Cannot confirm while the episode is changing' },
      { status: 409 }
    )
  }

  // 触发 tts_processing 步骤
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/pipeline/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
    },
    body: JSON.stringify({
      episodeId: id,
      userId: user.id,
      step: 'tts_processing',
      attempt: 1,
    }),
  })

  if (!res.ok) {
    await supabase
      .from('episodes')
      .update({ status: 'script_ready' })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'confirming')
    const err = await res.json().catch(() => ({}))
    return NextResponse.json(
      { error: err.error || 'Pipeline trigger failed' },
      { status: res.status }
    )
  }

  return NextResponse.json({ status: 'confirmed', next: 'tts_processing' })
}
