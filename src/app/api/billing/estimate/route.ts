import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { estimateCost, type CostEstimateInput } from '@/lib/services/cost'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // 脚本模式：精确计费
  if (body.script_char_count && body.script_char_count > 0) {
    const tts_cost = (body.script_char_count / 1000) * 0.015
    const mixing_cost = 0.01
    const total = tts_cost + mixing_cost

    const { data: profile } = await supabase
      .from('profiles')
      .select('balance')
      .eq('id', user.id)
      .single()

    return NextResponse.json({
      llm_cost: 0,
      tts_cost,
      mixing_cost,
      total,
      breakdown: { estimated_script_chars: body.script_char_count, estimated_llm_tokens: 0, estimated_tts_chars: body.script_char_count },
      balance: profile?.balance ?? 0,
      sufficient: (profile?.balance ?? 0) >= total,
    })
  }

  // AI 模式：估算计费
  const input: CostEstimateInput = body

  if (!input.duration_min || input.duration_min < 1 || input.duration_min > 60) {
    return NextResponse.json(
      { error: 'duration_min must be between 1 and 60' },
      { status: 400 }
    )
  }

  const estimate = estimateCost(input)

  // 查询用户余额
  const { data: profile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    ...estimate,
    balance: profile?.balance ?? 0,
    sufficient: (profile?.balance ?? 0) >= estimate.total,
  })
}
