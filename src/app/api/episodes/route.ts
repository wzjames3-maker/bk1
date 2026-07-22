import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { preCharge } from '@/lib/services/billing'
import { estimateCost } from '@/lib/services/cost'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project_id')

  let query = supabase
    .from('episodes')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // 服务端独立计算费用，不信任客户端传入的 estimated_cost
  const params = body.params || {}
  const materialCharCount = (body.materials || []).reduce(
    (sum: number, m: { text?: string }) => sum + (m.text?.length || 0), 0
  )
  const durationMin = Math.min(Math.max(Number(params.duration_min) || 10, 1), 60)
  const rolesCount = Math.min(Math.max(Number(params.roles_count) || 2, 1), 10)
  const costEstimate = estimateCost({
    duration_min: durationMin,
    roles_count: rolesCount,
    material_char_count: materialCharCount,
  })
  const estimatedCost = costEstimate.total

  // 先创建 episode
  const { data, error } = await supabase
    .from('episodes')
    .insert({
      user_id: user.id,
      project_id: body.project_id || null,
      topic: body.topic,
      params: { ...body.params, duration_min: durationMin, roles_count: rolesCount },
      materials: body.materials,
      title: body.title || null,
      estimated_cost: estimatedCost || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 预扣余额（使用真实 episode ID）
  if (estimatedCost > 0) {
    const charged = await preCharge(user.id, estimatedCost, data.id)
    if (!charged) {
      // 余额不足，删除刚创建的 episode
      await supabase.from('episodes').delete().eq('id', data.id)
      return NextResponse.json({ error: '余额不足，请先充值' }, { status: 402 })
    }
  }

  // 触发 pipeline 第一步（parsing）
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  fetch(`${baseUrl}/api/pipeline/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
    },
    body: JSON.stringify({
      episodeId: data.id,
      userId: user.id,
      step: 'parsing',
      attempt: 1,
    }),
  }).catch(() => {})

  return NextResponse.json(data, { status: 201 })
}
