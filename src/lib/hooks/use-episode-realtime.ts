'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Episode, EpisodeStep } from '@/types/database'

interface UseEpisodeRealtimeResult {
  episode: Episode | null
  steps: EpisodeStep[]
  isConnected: boolean
}

export function useEpisodeRealtime(
  episodeId: string,
  initialEpisode: Episode,
  initialSteps: EpisodeStep[]
): UseEpisodeRealtimeResult {
  const [episode, setEpisode] = useState<Episode>(initialEpisode)
  const [steps, setSteps] = useState<EpisodeStep[]>(initialSteps)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    // 订阅 episode 表变更
    const episodeChannel = supabase
      .channel(`episode-${episodeId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'episodes',
          filter: `id=eq.${episodeId}`,
        },
        (payload) => {
          setEpisode(payload.new as Episode)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setIsConnected(true)
      })

    // 订阅 episode_steps 表变更
    const stepsChannel = supabase
      .channel(`steps-${episodeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'episode_steps',
          filter: `episode_id=eq.${episodeId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setSteps(prev => [...prev, payload.new as EpisodeStep])
          } else if (payload.eventType === 'UPDATE') {
            setSteps(prev =>
              prev.map(s => s.id === (payload.new as EpisodeStep).id ? payload.new as EpisodeStep : s)
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(episodeChannel)
      supabase.removeChannel(stepsChannel)
    }
  }, [episodeId])

  return { episode, steps, isConnected }
}
