import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 原子地把 script_ready 声明为 confirming，避免与 AI 改稿同时开始。
  const { data: confirmed, error: confirmError } = await supabase.rpc('confirm_episode_for_tts', {
    p_episode_id: id,
  })
  if (confirmError) {
    return NextResponse.json({ error: `Unable to confirm episode: ${confirmError.message}` }, { status: 500 })
  }
  if (!confirmed) {
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
