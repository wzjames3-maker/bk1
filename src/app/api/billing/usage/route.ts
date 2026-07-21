import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '50')

  // 交易记录
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  // 用量明细
  const { data: usage } = await supabase
    .from('usage_records')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  // 当前余额
  const { data: profile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    balance: profile?.balance ?? 0,
    transactions: transactions || [],
    usage: usage || [],
  })
}
