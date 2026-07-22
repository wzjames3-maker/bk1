import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { estimateCost, type CostEstimateInput } from '@/lib/services/cost'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: CostEstimateInput = await request.json()

  if (!body.duration_min || body.duration_min < 1 || body.duration_min > 60) {
    return NextResponse.json(
      { error: 'duration_min must be between 1 and 60' },
      { status: 400 }
    )
  }

  const estimate = estimateCost(body)

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
