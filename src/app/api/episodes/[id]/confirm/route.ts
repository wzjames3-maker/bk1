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

  // 验证 episode 属于当前用户且状态为 script_ready
  const { data: episode } = await supabase
    .from('episodes')
    .select('id, status, user_id')
    .eq('id', id)
    .single()

  if (!episode || episode.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (episode.status !== 'script_ready') {
    return NextResponse.json(
      { error: `Cannot confirm in status: ${episode.status}` },
      { status: 400 }
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
    const err = await res.json().catch(() => ({}))
    return NextResponse.json(
      { error: err.error || 'Pipeline trigger failed' },
      { status: res.status }
    )
  }

  return NextResponse.json({ status: 'confirmed', next: 'tts_processing' })
}
