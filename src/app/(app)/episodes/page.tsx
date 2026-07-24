import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EpisodeList } from '@/components/episodes/episode-list'

export const dynamic = 'force-dynamic'

export default async function EpisodesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">我的作品</h1>
        <p className="text-muted-foreground">管理所有播客节目</p>
      </div>
      <EpisodeList />
    </div>
  )
}
