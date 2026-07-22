'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Episode, EpisodeStep } from '@/types/database'

interface UseEpisodeRealtimeResult {
  episode: Episode | null
  steps: EpisodeStep[]
  isConnected: boolean
}

const TERMINAL = new Set(['completed', 'failed'])

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  parsing: 1,
  scripting: 2,
  script_ready: 3,
  confirming: 4,
  tts_processing: 5,
  mixing: 6,
  post_processing: 7,
  completed: 8,
  failed: 8,
}

function isNewerEpisode(prev: Episode, next: Episode): boolean {
  if (prev.id !== next.id) return true
  const prevRank = STATUS_RANK[prev.status] ?? 0
  const nextRank = STATUS_RANK[next.status] ?? 0
  if (nextRank !== prevRank) return nextRank > prevRank
  // 同状态时：有新 URL / 章节 / 笔记 也接受
  if (!!next.audio_url !== !!prev.audio_url) return !!next.audio_url
  if (!!next.preview_url !== !!prev.preview_url) return !!next.preview_url
  if (!!next.show_notes !== !!prev.show_notes) return !!next.show_notes
  if (!!next.completed_at !== !!prev.completed_at) return !!next.completed_at
  return true
}

export function useEpisodeRealtime(
  episodeId: string,
  initialEpisode: Episode,
  initialSteps: EpisodeStep[]
): UseEpisodeRealtimeResult {
  // 父组件应对不同 episode 使用 key，避免跨节目复用 state
  const [episode, setEpisode] = useState<Episode>(initialEpisode)
  const [steps, setSteps] = useState<EpisodeStep[]>(initialSteps)
  const [isConnected, setIsConnected] = useState(false)
  const statusRef = useRef(initialEpisode.status)

  useEffect(() => {
    statusRef.current = episode.status
  }, [episode.status])

  const applyEpisode = useCallback((next: Episode) => {
    setEpisode(prev => (isNewerEpisode(prev, next) ? next : prev))
    statusRef.current = next.status
  }, [])

  // Realtime 订阅（若控制台未开启 publication，可能不会推送）
  useEffect(() => {
    const supabase = createClient()

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
          applyEpisode(payload.new as Episode)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setIsConnected(true)
      })

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
            setSteps(prev => {
              const next = payload.new as EpisodeStep
              if (prev.some(s => s.id === next.id)) {
                return prev.map(s => (s.id === next.id ? next : s))
              }
              return [...prev, next]
            })
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
  }, [episodeId, applyEpisode])

  // 轮询兜底：Realtime 未启用时仍可自动刷新状态
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      if (cancelled) return
      if (TERMINAL.has(statusRef.current)) return

      try {
        const res = await fetch(`/api/episodes/${episodeId}`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) {
            const { steps: nextSteps, ...nextEpisode } = data
            applyEpisode(nextEpisode as Episode)
            if (Array.isArray(nextSteps)) setSteps(nextSteps as EpisodeStep[])
          }
        }
      } catch {
        // ignore transient network errors
      }

      if (!cancelled && !TERMINAL.has(statusRef.current)) {
        timer = setTimeout(poll, 2000)
      }
    }

    if (!TERMINAL.has(statusRef.current)) {
      timer = setTimeout(poll, 1500)
    }

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [episodeId, applyEpisode])

  return { episode, steps, isConnected }
}
