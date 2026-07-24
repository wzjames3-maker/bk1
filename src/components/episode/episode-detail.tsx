'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PipelineProgress } from './pipeline-progress'
import { AudioPlayer } from './audio-player'
import { ScriptViewer } from './script-viewer'
import { ScriptEditor } from './script-editor'
import { ShowNotes } from './show-notes'
import { DeleteDialog } from '@/components/episodes/delete-dialog'
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

const REWRITE_LIMIT = 3

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
  const [rewriting, setRewriting] = useState(false)
  const [scriptOverride, setScriptOverride] = useState<ScriptSegment[] | null>(null)
  const [rewriteCountLocal, setRewriteCountLocal] = useState<number | null>(null)

  if (!episode) return null

  const baseScript: ScriptSegment[] = typeof episode.script === 'string'
    ? JSON.parse(episode.script)
    : episode.script || []
  const script = scriptOverride ?? baseScript

  const rawChapters = typeof episode.chapters === 'string'
    ? JSON.parse(episode.chapters)
    : episode.chapters || []

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
  const canRegenerate = episode.status === 'completed' || episode.status === 'failed'
  const [regenerating, setRegenerating] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)

  const handleShare = async () => {
    setShareLoading(true)
    try {
      const res = await fetch(`/api/episodes/${episode.id}/share`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '生成链接失败')
      const url = `${window.location.origin}/share/${data.share_token}`
      await navigator.clipboard.writeText(url)
      toast.success('分享链接已复制到剪贴板')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setShareLoading(false)
    }
  }

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const res = await fetch(`/api/episodes/${episode.id}/regenerate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '重新生成失败')
      toast.success('已开始重新生成')
      router.push(`/episodes/${data.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRegenerating(false)
    }
  }

  const rewriteCount =
    rewriteCountLocal ?? Number(episode.params?.rewrite_count || 0)
  const rewriteDisabled = rewriting || rewriteCount >= REWRITE_LIMIT

  const handleConfirm = async () => {
    try {
      const res = await fetch(`/api/episodes/${episode.id}/confirm`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '确认脚本失败')
      }
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleRetry = async () => {
    await fetch(`/api/episodes/${episode.id}/retry`, { method: 'POST' })
    router.refresh()
  }

  const handleSaveScript = async (newScript: ScriptSegment[]) => {
    const res = await fetch(`/api/episodes/${episode.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script: newScript }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || '保存失败')
      return
    }
    setScriptOverride(newScript)
    setEditing(false)
    toast.success('脚本已保存')
    router.refresh()
  }

  const handlePolish = async () => {
    setRewriting(true)
    try {
      const res = await fetch(`/api/episodes/${episode.id}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'polish' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '润色失败')
      setScriptOverride(data.script)
      setRewriteCountLocal(data.rewrite_count)
      setEditing(true)
      toast.success('AI 润色完成')
      router.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRewriting(false)
    }
  }

  return (
    <div className="space-y-6">
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
        <div className="flex flex-wrap gap-2 justify-end">
          {canEdit && (
            <Button
              variant="outline"
              onClick={handlePolish}
              disabled={rewriteDisabled}
            >
              {rewriting
                ? '润色中...'
                : `AI 整段润色（${rewriteCount}/${REWRITE_LIMIT}）`}
            </Button>
          )}
          {canConfirm && (
            <Button onClick={handleConfirm} disabled={rewriting}>
              确认脚本，开始合成
            </Button>
          )}
          {canRetry && (
            <Button variant="outline" onClick={handleRetry}>重试</Button>
          )}
          {canRegenerate && (
            <Button variant="outline" onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? '生成中...' : '🔄 重新生成'}
            </Button>
          )}
          {episode.status === 'completed' && (
            <Button size="sm" variant="outline" onClick={handleShare} disabled={shareLoading}>
              {shareLoading ? '生成中...' : '🔗 分享'}
            </Button>
          )}
          <DeleteDialog
            episodeId={episode.id}
            episodeTitle={episode.title || episode.topic || '未命名节目'}
          />
        </div>
      </div>

      <AudioPlayer
        audioUrl={episode.audio_url}
        previewUrl={episode.preview_url}
        chapters={chapters}
        status={episode.status}
        title={episode.title || episode.topic}
      />

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
                编辑脚本
              </Button>
            </div>
          )}
          {editing ? (
            <ScriptEditor
              key={`edit-${rewriteCount}-${script.length}`}
              script={script}
              onSave={handleSaveScript}
              onCancel={() => setEditing(false)}
              episodeId={episode.id}
              rewriteDisabled={rewriteDisabled}
              onScriptReplaced={(next, count) => {
                setScriptOverride(next)
                if (typeof count === 'number') setRewriteCountLocal(count)
              }}
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
