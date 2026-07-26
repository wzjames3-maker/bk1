import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/app-shell'
import { Toaster } from '@/components/ui/sonner'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <AppShell>
      {children}
      <Toaster position="top-center" richColors />
    </AppShell>
  )
}
