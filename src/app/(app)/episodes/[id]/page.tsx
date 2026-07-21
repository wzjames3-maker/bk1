import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EpisodeDetail } from '@/components/episode/episode-detail'
import type { Episode, EpisodeStep } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: episode } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!episode) redirect('/dashboard')

  const { data: steps } = await supabase
    .from('episode_steps')
    .select('*')
    .eq('episode_id', id)
    .order('started_at', { ascending: true })

  return (
    <EpisodeDetail
      initialEpisode={episode as Episode}
      initialSteps={(steps || []) as EpisodeStep[]}
    />
  )
}
