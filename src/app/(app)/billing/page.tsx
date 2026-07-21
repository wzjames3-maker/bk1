import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BalanceCard } from '@/components/billing/balance-card'
import { TransactionList } from '@/components/billing/transaction-list'
import { UsageList } from '@/components/billing/usage-list'
import type { Transaction, UsageLog } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single()

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: usage } = await supabase
    .from('usage_records')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">账单中心</h1>
      <BalanceCard balance={profile?.balance ?? 0} />
      <div className="grid gap-6 md:grid-cols-2">
        <TransactionList transactions={(transactions || []) as Transaction[]} />
        <UsageList usage={(usage || []) as UsageLog[]} />
      </div>
    </div>
  )
}
