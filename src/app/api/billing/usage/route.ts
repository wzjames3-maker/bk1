import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // 日期筛选
  const startDate = searchParams.get('start_date') // YYYY-MM-DD
  const endDate = searchParams.get('end_date')     // YYYY-MM-DD
  // 类型筛选（transactions）
  const txType = searchParams.get('type') // charge | refund | topup

  // 交易记录（分页 + 日期 + 类型）
  let txQuery = supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (startDate) txQuery = txQuery.gte('created_at', `${startDate}T00:00:00`)
  if (endDate) txQuery = txQuery.lte('created_at', `${endDate}T23:59:59`)
  if (txType) txQuery = txQuery.eq('type', txType)

  const { data: transactions, count: txTotal } = await txQuery

  // 用量明细（分页 + 日期）
  let usageQuery = supabase
    .from('usage_logs')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (startDate) usageQuery = usageQuery.gte('created_at', `${startDate}T00:00:00`)
  if (endDate) usageQuery = usageQuery.lte('created_at', `${endDate}T23:59:59`)

  const { data: usage, count: usageTotal } = await usageQuery

  // 当前余额
  const { data: profile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    balance: profile?.balance ?? 0,
    transactions: transactions || [],
    txTotal: txTotal || 0,
    usage: usage || [],
    usageTotal: usageTotal || 0,
    page,
    pageSize,
  })
}
