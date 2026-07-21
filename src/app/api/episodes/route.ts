import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const { data, error } = await supabase
    .from('episodes')
    .insert({
      user_id: user.id,
      project_id: body.project_id || null,
      topic: body.topic,
      params: body.params,
      materials: body.materials,
      title: body.title || null,
      estimated_cost: body.estimated_cost || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
  }).catch(() => {})  // fire-and-forget，不阻塞响应

  return NextResponse.json(data, { status: 201 })
}
