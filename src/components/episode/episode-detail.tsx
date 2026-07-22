'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PipelineProgress } from './pipeline-progress'
import { AudioPlayer } from './audio-player'
import { ScriptViewer } from './script-viewer'
import { ScriptEditor } from './script-editor'
import { ShowNotes } from './show-notes'
import { useEpisodeRealtime } from '@/lib/hooks/use-episode-realtime'
import type { Episode, EpisodeStep, ScriptSegment } from '@/types/database'

interface Props {
  initialEpisode: Episode
  initialSteps: EpisodeStep[]
}

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '等待中', variant: 'secondary' },
  parsing: { label: '解析中', variant: 'default' },
  scripting: { label: '编剧中', variant: 'default' },
  script_ready: { label: '待确认', variant: 'outline' },
  confirming: { label: '确认中', variant: 'default' },
  tts_processing: { label: '合成中', variant: 'default' },
  mixing: { label: '混音中', variant: 'default' },
  post_processing: { label: '后处理', variant: 'default' },
  completed: { label: '已完成', variant: 'default' },
  failed: { label: '失败', variant: 'destructive' },
}

export function EpisodeDetail({ initialEpisode, initialSteps }: Props) {
  return (
    <EpisodeDetailInner
      key={initialEpisode.id}
      initialEpisode={initialEpisode}
      initialSteps={initialSteps}
    />
  )
}

function EpisodeDetailInner({ initialEpisode, initialSteps }: Props) {
  const router = useRouter()
  const { episode, steps } = useEpisodeRealtime(initialEpisode.id, initialEpisode, initialSteps)
  const [editing, setEditing] = useState(false)

  if (!episode) return null

  const script: ScriptSegment[] = typeof episode.script === 'string'
    ? JSON.parse(episode.script)
    : episode.script || []

  const rawChapters = typeof episode.chapters === 'string'
    ? JSON.parse(episode.chapters)
    : episode.chapters || []

  // 后处理后 chapters 为 {time, title}[]；TTS 中转数据不再写入该字段
  const chapters: Array<{ time: string; title: string }> =
    Array.isArray(rawChapters) &&
    rawChapters.length > 0 &&
    typeof rawChapters[0] === 'object' &&
    rawChapters[0] !== null &&
    'time' in rawChapters[0] &&
    'title' in rawChapters[0]
      ? rawChapters
      : []

  const statusInfo = STATUS_LABELS[episode.status] || { label: episode.status, variant: 'secondary' as const }
  const canEdit = episode.status === 'script_ready'
  const canConfirm = episode.status === 'script_ready'
  const canRetry = episode.status === 'failed'

  const handleConfirm = async () => {
    await fetch(`/api/episodes/${episode.id}/confirm`, { method: 'POST' })
    router.refresh()
  }

  const handleRetry = async () => {
    await fetch(`/api/episodes/${episode.id}/retry`, { method: 'POST' })
    router.refresh()
  }

  const handleSaveScript = async (newScript: ScriptSegment[]) => {
    await fetch(`/api/episodes/${episode.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: newScript }),
    })
    setEditing(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{episode.title || episode.topic}</h1>
          <div className="flex items-center gap-2">
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            <span className="text-sm text-muted-foreground">
              {new Date(episode.created_at).toLocaleString('zh-CN')}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {canConfirm && (
            <Button onClick={handleConfirm}>✅ 确认脚本，开始合成</Button>
          )}
          {canRetry && (
            <Button variant="outline" onClick={handleRetry}>🔄 重试</Button>
          )}
        </div>
      </div>

      {/* 播放器 */}
      <AudioPlayer
        audioUrl={episode.audio_url}
        previewUrl={episode.preview_url}
        chapters={chapters}
        status={episode.status}
      />

      {/* Tabs */}
      <Tabs defaultValue="progress">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="progress">进度</TabsTrigger>
          <TabsTrigger value="script">脚本</TabsTrigger>
          <TabsTrigger value="notes">Show Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="progress" className="pt-4">
          <PipelineProgress
            status={episode.status}
            steps={steps}
            failedAtStep={episode.failed_at_step}
          />
        </TabsContent>

        <TabsContent value="script" className="pt-4">
          {canEdit && !editing && (
            <div className="mb-4">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                ✏️ 编辑脚本
              </Button>
            </div>
          )}
          {editing ? (
            <ScriptEditor
              script={script}
              onSave={handleSaveScript}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <ScriptViewer script={script} />
          )}
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          <ShowNotes
            showNotes={episode.show_notes}
            coverSuggestion={episode.cover_url}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
