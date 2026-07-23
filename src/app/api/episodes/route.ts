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
  const rolesCount = Math.min(Math.max(Number(params.roles_count) || 1, 1), 10)
  const costEstimate = estimateCost({
    duration_min: durationMin,
    roles_count: rolesCount,
    material_char_count: materialCharCount,
  })
  const estimatedCost = costEstimate.total

  // 未指定项目时，自动归入用户默认项目（没有则创建）
  let projectId: string | null = typeof body.project_id === 'string' ? body.project_id : null
  if (projectId) {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 })
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  if (!projectId) {
    const { data: existingProject } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (existingProject?.id) {
      projectId = existingProject.id
    } else {
      const { data: createdProject } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          name: '默认项目',
          description: '自动创建的播客项目',
        })
        .select('id')
        .single()
      projectId = createdProject?.id || null
    }
  }

  // === 脚本模式：用户直传 script，跳过 parsing + scripting ===
  const userScript = body.script as Array<{ role: string; text: string; emotion?: string; pause_ms?: number }> | undefined
  if (userScript && Array.isArray(userScript) && userScript.length > 0) {
    const normalizedScript = userScript.map(s => ({
      role: s.role || '主播',
      text: s.text || '',
      emotion: s.emotion || '中性',
      pause_ms: s.pause_ms ?? 300,
    }))

    const { data, error } = await supabase
      .from('episodes')
      .insert({
        user_id: user.id,
        project_id: projectId,
        topic: body.topic || '用户脚本',
        script: JSON.stringify(normalizedScript),
        status: 'script_ready',
        params: { ...body.params, source: 'user_script' },
        materials: [],
        title: body.title || body.topic || '用户脚本',
        estimated_cost: estimatedCost || null,
        preview_url: 'pending',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 预扣费
    if (estimatedCost && estimatedCost > 0) {
      const charged = await preCharge(user.id, estimatedCost, data.id)
      if (!charged) {
        await supabase.from('episodes').delete().eq('id', data.id)
        return NextResponse.json({ error: 'Insufficient balance' }, { status: 402 })
      }
    }

    // skip_confirmation 时直接触发 confirming → TTS
    if (body.params?.skip_confirmation) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      void fetch(`${baseUrl}/api/pipeline/advance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
        },
        body: JSON.stringify({
          episodeId: data.id,
          userId: user.id,
          step: 'confirming',
          attempt: 1,
        }),
      })
    }

    return NextResponse.json(data, { status: 201 })
  }

  // === 以下为现有 AI 编剧模式（不变） ===

  // 先创建 episode
  const { data, error } = await supabase
    .from('episodes')
    .insert({
      user_id: user.id,
      project_id: projectId,
      topic: body.topic,
      params: { ...body.params, duration_min: durationMin, roles_count: rolesCount },
      materials: body.materials,
      title: body.title || body.topic || null,
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
