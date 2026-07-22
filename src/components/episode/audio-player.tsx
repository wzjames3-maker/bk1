'use client'

import { useRef, useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Chapter {
  time: string    // "00:00" 格式
  title: string
}

interface Props {
  audioUrl: string | null
  previewUrl: string | null
  chapters: Chapter[]
  status: string
}

function timeToSeconds(time: string): number {
  const parts = time.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function AudioPlayer({ audioUrl, previewUrl, chapters, status }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const src = audioUrl || (previewUrl && status !== 'completed' ? previewUrl : null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)

    const onTime = () => setCurrentTime(audio.currentTime)
    const onMeta = () => setDuration(audio.duration || 0)
    const onEnd = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)
    audio.load()

    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
    }
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const seekTo = (seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = seconds
    setCurrentTime(seconds)
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  if (!src) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {status === 'completed' ? '音频加载失败' : '音频尚未生成'}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <audio ref={audioRef} src={src} preload="metadata" />

        {/* 进度条 */}
        <div
          className="relative h-2 w-full cursor-pointer rounded-full bg-muted"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const x = (e.clientX - rect.left) / rect.width
            seekTo(x * duration)
          }}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
          {/* 章节标记 */}
          {chapters.map((ch, i) => {
            const pos = duration > 0 ? (timeToSeconds(ch.time) / duration) * 100 : 0
            return (
              <div
                key={i}
                className="absolute top-0 h-full w-0.5 bg-primary/40"
                style={{ left: `${pos}%` }}
                title={ch.title}
              />
            )
          })}
        </div>

        {/* 控制栏 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={togglePlay}>
              {isPlaying ? '⏸️' : '▶️'}
            </Button>
            <span className="text-sm text-muted-foreground">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {!audioUrl && previewUrl && (
            <span className="text-xs text-muted-foreground">试听片段（30s）</span>
          )}
        </div>

        {/* 章节列表 */}
        {chapters.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">章节</p>
            {chapters.map((ch, i) => (
              <button
                key={i}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
                onClick={() => seekTo(timeToSeconds(ch.time))}
              >
                <span className="text-xs text-muted-foreground w-10">{ch.time}</span>
                <span>{ch.title}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
