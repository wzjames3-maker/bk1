import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { preCharge } from '@/lib/services/billing'
import { estimateCost } from '@/lib/services/cost'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: source } = await admin
    .from('episodes')
    .select('id, user_id, topic, title, materials, params, project_id, status')
    .eq('id', id)
    .single()

  if (!source || source.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!['completed', 'failed'].includes(source.status)) {
    return NextResponse.json(
      { error: '只能对已完成或失败的节目重新生成' },
      { status: 400 }
    )
  }

  const srcParams = source.params as Record<string, unknown>
  const durationMin = Number(srcParams.duration_min) || 10
  const rolesCount = Number(srcParams.roles_count) || 1
  const materials = (source.materials || []) as Array<{ text?: string; extracted_text?: string }>
  const materialCharCount = materials.reduce(
    (sum, m) => sum + ((m.extracted_text || m.text || '').length), 0
  )

  const costEstimate = estimateCost({
    duration_min: durationMin,
    roles_count: rolesCount,
    material_char_count: materialCharCount,
  })
  const estimatedCost = costEstimate.total

  const { data: newEpisode, error } = await supabase
    .from('episodes')
    .insert({
      user_id: user.id,
      project_id: source.project_id,
      topic: source.topic,
      title: source.title ? `${source.title}（重新生成）` : `${source.topic}（重新生成）`,
      materials: source.materials,
      params: {
        duration_min: durationMin,
        style: srcParams.style || 'casual',
        roles_count: rolesCount,
        voice_ids: srcParams.voice_ids || [],
        bgm: srcParams.bgm || 'none',
        skip_confirmation: false,
        regenerated_from: id,
      },
      estimated_cost: estimatedCost || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (estimatedCost > 0) {
    const charged = await preCharge(user.id, estimatedCost, newEpisode.id)
    if (!charged) {
      await supabase.from('episodes').delete().eq('id', newEpisode.id)
      return NextResponse.json({ error: '余额不足，无法重新生成' }, { status: 402 })
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  fetch(`${baseUrl}/api/pipeline/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
    },
    body: JSON.stringify({
      episodeId: newEpisode.id,
      userId: user.id,
      step: 'parsing',
      attempt: 1,
    }),
  }).catch(() => {})

  return NextResponse.json(newEpisode, { status: 201 })
}
