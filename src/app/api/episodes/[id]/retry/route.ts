import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { preCharge } from '@/lib/services/billing'
import type { PipelineStep } from '@/types/pipeline'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: episode } = await admin
    .from('episodes')
    .select('id, status, failed_at_step, user_id, estimated_cost, refunded_at')
    .eq('id', id)
    .single()

  if (!episode || episode.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (episode.status !== 'failed' || !episode.failed_at_step) {
    return NextResponse.json({ error: 'Episode is not in failed state' }, { status: 400 })
  }

  // 如果之前已退款，重试前重新扣费（原子清除标记防止并发重复扣费）
  if (episode.refunded_at && episode.estimated_cost) {
    const { data: cleared } = await admin
      .from('episodes')
      .update({ refunded_at: null })
      .eq('id', id)
      .not('refunded_at', 'is', null)
      .select('id')

    if (cleared && cleared.length > 0) {
      const charged = await preCharge(user.id, Number(episode.estimated_cost), id)
      if (!charged) {
        // 扣费失败，恢复退款标记
        await admin
          .from('episodes')
          .update({ refunded_at: new Date().toISOString() })
          .eq('id', id)
        return NextResponse.json({ error: '余额不足，无法重试' }, { status: 402 })
      }
    }
  }

  const retryStep = episode.failed_at_step as PipelineStep

  // 触发重试
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
      step: retryStep,
      attempt: 1,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json(
      { error: err.error || 'Pipeline retry failed' },
      { status: res.status }
    )
  }

  return NextResponse.json({ status: 'retrying', step: retryStep })
}
