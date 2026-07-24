import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BillingDashboard } from '@/components/billing/billing-dashboard'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <BillingDashboard />
}
