# M4：剧集详情（播放器 + 脚本编辑 + 进度追踪）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现完整的剧集详情页——音频播放器（章节跳转）、Pipeline 实时进度时间线、脚本展示与编辑、Show Notes 展示，以及对应的 API 路由。

**架构：** 剧集详情页为 Server Component 获取初始数据，客户端组件通过 Supabase Realtime 订阅 episode 和 episode_steps 表变更实现实时进度更新；音频播放器使用原生 HTML5 Audio + 自定义 UI；脚本编辑使用可编辑的对话卡片列表。

**技术栈：** Next.js 16, shadcn/ui, Supabase Realtime, HTML5 Audio API, @supabase/supabase-js

**前置依赖：** M1-M3 已完成（Auth + DB + 创建流程 + Pipeline）

---

## 文件结构

```
├── src/
│   ├── app/
│   │   ├── (app)/episodes/[id]/
│   │   │   ├── page.tsx                    # 剧集详情页（Server Component 壳）
│   │   │   └── loading.tsx                 # 加载骨架屏
│   │   └── api/episodes/[id]/route.ts      # GET/PATCH/DELETE 单集 API
│   ├── components/
│   │   ├── episode/
│   │   │   ├── episode-detail.tsx          # 详情页主容器（Tabs 布局）
│   │   │   ├── pipeline-progress.tsx       # Pipeline 进度时间线（Realtime）
│   │   │   ├── audio-player.tsx            # 音频播放器（章节跳转）
│   │   │   ├── script-viewer.tsx           # 脚本展示（只读）
│   │   │   ├── script-editor.tsx           # 脚本编辑（可编辑对话卡片）
│   │   │   └── show-notes.tsx             # Show Notes + 章节展示
│   │   └── ui/                            # shadcn 组件（已有）
│   └── lib/
│       └── hooks/
│           └── use-episode-realtime.ts     # Realtime 订阅 Hook
```

---

## 全局约束

- 剧集详情页使用 Supabase Realtime 订阅 `episodes` 和 `episode_steps` 表变更
- 音频播放器：HTML5 Audio + 自定义进度条 + 章节标记跳转
- 脚本编辑：仅在 `script_ready` 状态下可编辑，编辑后 PATCH 保存
- Next.js 16 动态路由 params 是 Promise：`{ params }: { params: Promise<{ id: string }> }` + `await params`
- 页面需要 `export const dynamic = 'force-dynamic'`（使用 Supabase 服务端客户端）

---

### 任务 1：Episodes [id] API（GET/PATCH/DELETE）

**文件：**
- 创建：`src/app/api/episodes/[id]/route.ts`

- [ ] **步骤 1：创建单集 API `src/app/api/episodes/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: episode, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !episode) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 获取步骤日志
  const { data: steps } = await supabase
    .from('episode_steps')
    .select('*')
    .eq('episode_id', id)
    .order('started_at', { ascending: true })

  return NextResponse.json({ ...episode, steps: steps || [] })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // 只允许更新 title 和 script
  const allowedFields: Record<string, unknown> = {}
  if (body.title !== undefined) allowedFields.title = body.title
  if (body.script !== undefined) allowedFields.script = body.script

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('episodes')
    .update(allowedFields)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('episodes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **步骤 2：Commit**

```bash
git add -A
git commit -m "feat: add episodes/[id] GET/PATCH/DELETE API"
```

---

### 任务 2：Realtime 订阅 Hook

**文件：**
- 创建：`src/lib/hooks/use-episode-realtime.ts`

- [ ] **步骤 1：创建 Realtime Hook `src/lib/hooks/use-episode-realtime.ts`**

```typescript
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
```

- [ ] **步骤 2：启用 Supabase Realtime 表复制**

在 Supabase Dashboard → SQL Editor 执行：

```sql
alter publication supabase_realtime add table episodes;
alter publication supabase_realtime add table episode_steps;
```

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "feat: add useEpisodeRealtime hook for live updates"
```

---

### 任务 3：Pipeline 进度时间线组件

**文件：**
- 创建：`src/components/episode/pipeline-progress.tsx`

- [ ] **步骤 1：创建进度时间线 `src/components/episode/pipeline-progress.tsx`**

```typescript
'use client'

import { cn } from '@/lib/utils'
import type { EpisodeStep } from '@/types/database'
import type { EpisodeStatus } from '@/types/database'

interface Props {
  status: EpisodeStatus
  steps: EpisodeStep[]
  failedAtStep: string | null
}

const STEP_LABELS: Record<string, string> = {
  parsing: '素材解析',
  scripting: 'AI 编剧',
  confirming: '脚本确认',
  tts_processing: '语音合成',
  mixing: '混音处理',
  post_processing: '后处理',
}

const STEP_ICONS: Record<string, string> = {
  parsing: '📄',
  scripting: '✍️',
  confirming: '👀',
  tts_processing: '🎙️',
  mixing: '🎵',
  post_processing: '📝',
}

export function PipelineProgress({ status, steps, failedAtStep }: Props) {
  const allStepKeys = ['parsing', 'scripting', 'confirming', 'tts_processing', 'mixing', 'post_processing']

  const getStepState = (stepKey: string) => {
    const stepLog = steps.find(s => s.step === stepKey)
    if (stepLog) {
      if (stepLog.status === 'done') return 'done'
      if (stepLog.status === 'running') return 'running'
      if (stepLog.status === 'failed') return 'failed'
    }
    if (status === 'completed') return 'done'
    if (status === 'failed' && failedAtStep === stepKey) return 'failed'
    return 'pending'
  }

  return (
    <div className="space-y-1">
      {allStepKeys.map((key, i) => {
        const state = getStepState(key)
        const stepLog = steps.find(s => s.step === key)

        return (
          <div key={key} className="flex items-center gap-3">
            {/* 连接线 */}
            <div className="flex flex-col items-center">
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm border',
                state === 'done' && 'bg-green-100 border-green-300 text-green-700',
                state === 'running' && 'bg-blue-100 border-blue-300 text-blue-700 animate-pulse',
                state === 'failed' && 'bg-red-100 border-red-300 text-red-700',
                state === 'pending' && 'bg-muted border-border text-muted-foreground',
              )}>
                {state === 'done' ? '✓' : state === 'failed' ? '✕' : STEP_ICONS[key]}
              </div>
              {i < allStepKeys.length - 1 && (
                <div className={cn(
                  'h-4 w-px',
                  state === 'done' ? 'bg-green-300' : 'bg-border'
                )} />
              )}
            </div>

            {/* 标签 */}
            <div className="flex-1 py-1">
              <p className={cn(
                'text-sm font-medium',
                state === 'pending' && 'text-muted-foreground'
              )}>
                {STEP_LABELS[key]}
              </p>
              {state === 'running' && (
                <p className="text-xs text-blue-600">处理中...</p>
              )}
              {state === 'failed' && stepLog?.error_message && (
                <p className="text-xs text-red-600 truncate max-w-xs">{stepLog.error_message}</p>
              )}
              {state === 'done' && stepLog?.finished_at && stepLog?.started_at && (
                <p className="text-xs text-muted-foreground">
                  耗时 {Math.round((new Date(stepLog.finished_at).getTime() - new Date(stepLog.started_at).getTime()) / 1000)}s
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **步骤 2：Commit**

```bash
git add -A
git commit -m "feat: add pipeline progress timeline component"
```

---

### 任务 4：音频播放器组件

**文件：**
- 创建：`src/components/episode/audio-player.tsx`

- [ ] **步骤 1：创建音频播放器 `src/components/episode/audio-player.tsx`**

```typescript
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

    const onTime = () => setCurrentTime(audio.currentTime)
    const onMeta = () => setDuration(audio.duration)
    const onEnd = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)

    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
    }
  }, [])

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
```

- [ ] **步骤 2：Commit**

```bash
git add -A
git commit -m "feat: add audio player component with chapter navigation"
```

---

### 任务 5：脚本展示 + 编辑组件

**文件：**
- 创建：`src/components/episode/script-viewer.tsx`, `src/components/episode/script-editor.tsx`

- [ ] **步骤 1：创建脚本展示 `src/components/episode/script-viewer.tsx`**

```typescript
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ScriptSegment } from '@/types/database'

interface Props {
  script: ScriptSegment[]
}

const EMOTION_COLORS: Record<string, string> = {
  '中性': 'bg-gray-100 text-gray-700',
  '开心': 'bg-yellow-100 text-yellow-700',
  '惊讶': 'bg-purple-100 text-purple-700',
  '思考': 'bg-blue-100 text-blue-700',
  '兴奋': 'bg-orange-100 text-orange-700',
}

export function ScriptViewer({ script }: Props) {
  if (!script || script.length === 0) {
    return <p className="text-muted-foreground text-sm">暂无脚本</p>
  }

  return (
    <div className="space-y-3">
      {script.map((seg, i) => (
        <Card key={i}>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">{seg.role}</span>
              <Badge variant="outline" className={EMOTION_COLORS[seg.emotion] || ''}>
                {seg.emotion}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed">{seg.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **步骤 2：创建脚本编辑 `src/components/episode/script-editor.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import type { ScriptSegment } from '@/types/database'

interface Props {
  script: ScriptSegment[]
  onSave: (script: ScriptSegment[]) => Promise<void>
  onCancel: () => void
}

export function ScriptEditor({ script, onSave, onCancel }: Props) {
  const [segments, setSegments] = useState<ScriptSegment[]>(script)
  const [saving, setSaving] = useState(false)

  const updateSegment = (index: number, field: keyof ScriptSegment, value: string | number) => {
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const removeSegment = (index: number) => {
    setSegments(prev => prev.filter((_, i) => i !== index))
  }

  const addSegment = (afterIndex: number) => {
    const newSeg: ScriptSegment = { role: segments[afterIndex]?.role || '主持人', text: '', emotion: '中性', pause_ms: 500 }
    setSegments(prev => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, newSeg)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(segments)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{segments.length} 段对话</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存脚本'}
          </Button>
        </div>
      </div>

      {segments.map((seg, i) => (
        <Card key={i}>
          <CardContent className="space-y-2 py-3">
            <div className="flex items-center gap-2">
              <Input
                className="w-24 h-8 text-sm"
                value={seg.role}
                onChange={(e) => updateSegment(i, 'role', e.target.value)}
              />
              <Input
                className="w-20 h-8 text-sm"
                value={seg.emotion}
                onChange={(e) => updateSegment(i, 'emotion', e.target.value)}
              />
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => addSegment(i)}>+ 插入</Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeSegment(i)}>删除</Button>
            </div>
            <Textarea
              rows={2}
              value={seg.text}
              onChange={(e) => updateSegment(i, 'text', e.target.value)}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "feat: add script viewer and editor components"
```

---

### 任务 6：Show Notes 组件 + 详情页主容器 + 页面

**文件：**
- 创建：`src/components/episode/show-notes.tsx`, `src/components/episode/episode-detail.tsx`, `src/app/(app)/episodes/[id]/page.tsx`, `src/app/(app)/episodes/[id]/loading.tsx`

- [ ] **步骤 1：创建 Show Notes `src/components/episode/show-notes.tsx`**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  showNotes: string | null
  chapters: Array<{ time: string; title: string }> | null
  coverSuggestion: string | null
}

export function ShowNotes({ showNotes, chapters, coverSuggestion }: Props) {
  return (
    <div className="space-y-4">
      {showNotes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">节目简介</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{showNotes}</p>
          </CardContent>
        </Card>
      )}

      {coverSuggestion && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">封面建议</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{coverSuggestion}</p>
          </CardContent>
        </Card>
      )}

      {!showNotes && !coverSuggestion && (
        <p className="text-sm text-muted-foreground">后处理完成后自动生成</p>
      )}
    </div>
  )
}
```

- [ ] **步骤 2：创建详情页主容器 `src/components/episode/episode-detail.tsx`**

```typescript
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

  // 只有后处理完成后 chapters 才是 {time, title}[] 格式
  const chapters: Array<{ time: string; title: string }> =
    episode.status === 'completed' && rawChapters.length > 0 && 'time' in rawChapters[0]
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
            chapters={chapters}
            coverSuggestion={episode.cover_url}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **步骤 3：覆盖详情页 `src/app/(app)/episodes/[id]/page.tsx`**（M1 占位页已存在，覆盖）

```typescript
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
```

- [ ] **步骤 4：创建加载骨架屏 `src/app/(app)/episodes/[id]/loading.tsx`**

```typescript
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-24 w-full" />
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  )
}
```

- [ ] **步骤 5：安装 Skeleton 组件（如未有）**

```bash
npx shadcn@latest add skeleton --yes
```

- [ ] **步骤 6：Commit**

```bash
git add -A
git commit -m "feat: add episode detail page with player, progress, script, and notes"
```

---

### 任务 7：集成验证

- [ ] **步骤 1：运行 TypeScript 检查**

```bash
npx tsc --noEmit
```
预期：0 错误。

- [ ] **步骤 2：运行构建**

```bash
npm run build
```
预期：构建成功。

- [ ] **步骤 3：验证路由**

确认 `/episodes/[id]` 路由存在且为 Dynamic。

- [ ] **步骤 4：Commit 修复（如有）**

```bash
git add -A
git commit -m "fix: resolve M4 integration issues"
```

---

## M4 完成标准

- [ ] /episodes/[id] 页面正常渲染剧集详情
- [ ] Pipeline 进度时间线显示所有步骤状态
- [ ] Realtime 订阅：Pipeline 运行时页面自动更新状态
- [ ] 音频播放器：播放/暂停 + 进度条 + 章节跳转
- [ ] 试听样本：未完成时播放 30s preview
- [ ] 脚本展示：对话卡片 + 角色 + 情绪标签
- [ ] 脚本编辑：script_ready 状态下可编辑、插入、删除段落
- [ ] PATCH /api/episodes/[id] 保存脚本修改
- [ ] 确认按钮：script_ready 时触发 TTS
- [ ] 重试按钮：failed 时触发重试
- [ ] Show Notes + 封面建议展示
- [ ] TypeScript 无类型错误
- [ ] `npm run build` 通过

---

## 后续里程碑

- M5：计费（Stripe 充值 + 按量扣费 + 账单页）
- M6：打磨（落地页 + PostHog + Sentry + 部署）