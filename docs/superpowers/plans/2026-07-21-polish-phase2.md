# 产品打磨 Phase 2 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 完成 4 项产品打磨——音色试听、批量操作、Cmd+K 全局搜索、分享页。

**架构：** 音色试听利用已有 `sample_url` 字段 + 按需生成；批量操作在 episode-list 增加 checkbox 多选 + 批量 API；Cmd+K 使用 `cmdk` 包实现命令面板；分享页通过 `share_token` 列实现无需登录的公开访问。

**技术栈：** Next.js App Router、Supabase、cmdk、sonner、MiMo TTS API

---

## 文件结构

| 操作 | 路径 | 职责 |
|------|------|------|
| 创建 | `src/app/api/voices/[id]/sample/route.ts` | 按需生成音色样音（3s 文本 → TTS → Storage） |
| 修改 | `src/components/create/step-params.tsx` | 脚本模式音色 Select 旁增加 ▶ 试听按钮 |
| 修改 | `src/components/episodes/episode-list.tsx` | 增加 checkbox 多选 + 批量操作栏 |
| 创建 | `src/app/api/episodes/bulk/route.ts` | 批量删除/重新生成 API |
| 创建 | `src/components/command-palette.tsx` | Cmd+K 命令面板（搜索节目 + 页面导航） |
| 修改 | `src/components/app-shell.tsx` | 挂载 CommandPalette 组件 |
| 创建 | `supabase/migrations/006_share_token.sql` | episodes 增加 share_token 列 |
| 创建 | `src/app/share/[token]/page.tsx` | 公开分享页（无需登录） |
| 创建 | `src/app/api/episodes/[id]/share/route.ts` | 生成/取消分享链接 API |
| 修改 | `src/components/episode/episode-detail.tsx` | 增加「分享」按钮 |

---

### 任务 1：音色样音生成 API

**文件：**
- 创建：`src/app/api/voices/[id]/sample/route.ts`

- [ ] **步骤 1：创建样音生成 API**

```typescript
// src/app/api/voices/[id]/sample/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { synthesizeSpeech } from '@/lib/services/tts-mimo'

const SAMPLE_TEXT = '你好，欢迎收听我们的播客节目，今天我们来聊一个有趣的话题。'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  // 查找音色
  const { data: voice } = await admin
    .from('voices')
    .select('*')
    .eq('id', id)
    .single()

  if (!voice) return NextResponse.json({ error: '音色不存在' }, { status: 404 })

  // 已有样音直接返回
  if (voice.sample_url) {
    return NextResponse.json({ sample_url: voice.sample_url })
  }

  // 生成样音
  try {
    const audioBuffer = await synthesizeSpeech(SAMPLE_TEXT, voice.provider_voice_id)

    // 上传到 Storage
    const path = `voice-samples/${voice.id}.mp3`
    const { error: uploadErr } = await admin.storage
      .from('podcast-audio')
      .upload(path, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadErr) throw uploadErr

    const { data: urlData } = admin.storage.from('podcast-audio').getPublicUrl(path)
    const sampleUrl = urlData.publicUrl

    // 更新数据库
    await admin.from('voices').update({ sample_url: sampleUrl }).eq('id', voice.id)

    return NextResponse.json({ sample_url: sampleUrl })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **步骤 2：验证构建**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/app/api/voices/[id]/sample/route.ts
git commit -m "feat(voices): 按需生成音色样音 API"
```

---

### 任务 2：脚本模式音色试听按钮

**文件：**
- 修改：`src/components/create/step-params.tsx`

- [ ] **步骤 1：在脚本模式音色 Select 旁添加试听按钮**

在 `step-params.tsx` 的脚本模式音色选择区域（`scriptRoles.map(role => ...)` 内），Select 后面添加试听按钮：

```tsx
// 在 Select 闭合标签 </Select> 之后添加：
<Button
  type="button"
  size="sm"
  variant="ghost"
  className="h-8 w-8 p-0"
  disabled={!voiceMapping[role] || playingVoice === role}
  onClick={async (e) => {
    e.stopPropagation()
    const voiceId = voiceMapping[role]
    if (!voiceId) return
    setPlayingVoice(role)
    try {
      const res = await fetch(`/api/voices/${voiceId}/sample`, { method: 'POST' })
      const data = await res.json()
      if (data.sample_url) {
        const audio = new Audio(data.sample_url)
        audio.onended = () => setPlayingVoice(null)
        audio.play()
      } else {
        setPlayingVoice(null)
      }
    } catch {
      setPlayingVoice(null)
    }
  }}
>
  {playingVoice === role ? '⏳' : '▶️'}
</Button>
```

需要在组件顶部添加 state：

```tsx
const [playingVoice, setPlayingVoice] = useState<string | null>(null)
```

- [ ] **步骤 2：验证构建**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/components/create/step-params.tsx
git commit -m "feat(voices): 脚本模式音色选择增加试听按钮"
```

---

### 任务 3：批量操作 API

**文件：**
- 创建：`src/app/api/episodes/bulk/route.ts`

- [ ] **步骤 1：创建批量操作 API**

```typescript
// src/app/api/episodes/bulk/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { action, ids } = body as { action: 'delete' | 'regenerate'; ids: string[] }

  if (!action || !Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
    return NextResponse.json({ error: '参数无效（最多 50 条）' }, { status: 400 })
  }

  if (action === 'delete') {
    const { error } = await supabase
      .from('episodes')
      .delete()
      .in('id', ids)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: ids.length })
  }

  if (action === 'regenerate') {
    // 逐个克隆（复用 regenerate 逻辑太重，这里简化为批量触发）
    const results: string[] = []
    for (const id of ids) {
      const res = await fetch(`${request.nextUrl.origin}/api/episodes/${id}/regenerate`, {
        method: 'POST',
        headers: { cookie: request.headers.get('cookie') || '' },
      })
      if (res.ok) {
        const data = await res.json()
        results.push(data.id)
      }
    }
    return NextResponse.json({ ok: true, regenerated: results.length })
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 })
}
```

- [ ] **步骤 2：验证构建**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/app/api/episodes/bulk/route.ts
git commit -m "feat(episodes): 批量删除/重新生成 API"
```

---

### 任务 4：作品列表批量操作 UI

**文件：**
- 修改：`src/components/episodes/episode-list.tsx`

- [ ] **步骤 1：添加多选 state 和 checkbox**

在 `EpisodeList` 组件中添加：

```tsx
const [selected, setSelected] = useState<Set<string>>(new Set())
const [bulkLoading, setBulkLoading] = useState(false)

const toggleSelect = (id: string) => {
  setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

const toggleSelectAll = () => {
  if (selected.size === episodes.length) {
    setSelected(new Set())
  } else {
    setSelected(new Set(episodes.map(ep => ep.id)))
  }
}

const handleBulk = async (action: 'delete' | 'regenerate') => {
  if (selected.size === 0) return
  setBulkLoading(true)
  try {
    const res = await fetch('/api/episodes/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids: [...selected] }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '操作失败')
    toast.success(action === 'delete' ? `已删除 ${data.deleted} 期` : `已触发 ${data.regenerated} 期重新生成`)
    setSelected(new Set())
    fetchEpisodes()
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    setBulkLoading(false)
  }
}
```

在筛选栏右侧（`共 {total} 期` 之前）添加全选 checkbox：

```tsx
<label className="flex items-center gap-1.5 text-sm cursor-pointer">
  <input
    type="checkbox"
    checked={episodes.length > 0 && selected.size === episodes.length}
    onChange={toggleSelectAll}
    className="size-4 rounded border-input"
  />
  全选
</label>
```

在每个 episode 卡片 `<CardContent>` 最前面添加 checkbox：

```tsx
<input
  type="checkbox"
  checked={selected.has(ep.id)}
  onChange={() => toggleSelect(ep.id)}
  className="size-4 shrink-0 rounded border-input"
/>
```

在筛选栏下方添加批量操作栏（仅 selected.size > 0 时显示）：

```tsx
{selected.size > 0 && (
  <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2">
    <span className="text-sm font-medium">已选 {selected.size} 期</span>
    <Button size="sm" variant="outline" disabled={bulkLoading} onClick={() => handleBulk('regenerate')}>
      🔄 批量重新生成
    </Button>
    <Button size="sm" variant="destructive" disabled={bulkLoading} onClick={() => handleBulk('delete')}>
      🗑️ 批量删除
    </Button>
    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>取消选择</Button>
  </div>
)}
```

- [ ] **步骤 2：验证构建**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/components/episodes/episode-list.tsx
git commit -m "feat(episodes): 列表批量选择 + 批量删除/重新生成"
```

---

### 任务 5：安装 cmdk + 创建命令面板

**文件：**
- 创建：`src/components/command-palette.tsx`
- 修改：`src/components/app-shell.tsx`

- [ ] **步骤 1：安装 cmdk**

运行：`npm install cmdk`

- [ ] **步骤 2：创建命令面板组件**

```tsx
// src/components/command-palette.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'

interface EpisodeResult {
  id: string
  title: string | null
  topic: string
  status: string
}

const PAGES = [
  { id: 'dashboard', label: '📊 工作台', href: '/dashboard' },
  { id: 'projects', label: '🎙️ 播客项目', href: '/projects' },
  { id: 'episodes', label: '📋 我的作品', href: '/episodes' },
  { id: 'create', label: '✨ 创建节目', href: '/create' },
  { id: 'billing', label: '💳 账单中心', href: '/billing' },
  { id: 'settings', label: '⚙️ 设置', href: '/settings' },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [episodes, setEpisodes] = useState<EpisodeResult[]>([])
  const [searching, setSearching] = useState(false)

  // Cmd+K / Ctrl+K 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // 搜索节目（防抖）
  useEffect(() => {
    if (!query.trim()) { setEpisodes([]); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/episodes?q=${encodeURIComponent(query)}&page=1`)
        const data = await res.json()
        setEpisodes(data.episodes || [])
      } catch { /* ignore */ }
      setSearching(false)
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  const go = (href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg rounded-xl border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <Command label="全局搜索" shouldFilter={false}>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="搜索节目或跳转页面..."
            className="w-full border-b px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Group heading="页面">
              {PAGES.filter(p => !query || p.label.toLowerCase().includes(query.toLowerCase())).map(p => (
                <Command.Item
                  key={p.id}
                  onSelect={() => go(p.href)}
                  className="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
                >
                  {p.label}
                </Command.Item>
              ))}
            </Command.Group>

            {(query.trim()) && (
              <Command.Group heading="节目">
                {searching && <p className="px-3 py-2 text-sm text-muted-foreground">搜索中...</p>}
                {!searching && episodes.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">无匹配结果</p>
                )}
                {episodes.map(ep => (
                  <Command.Item
                    key={ep.id}
                    onSelect={() => go(`/episodes/${ep.id}`)}
                    className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
                  >
                    <span className="truncate">{ep.title || ep.topic}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{ep.status}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
```

- [ ] **步骤 3：在 AppShell 中挂载**

修改 `src/components/app-shell.tsx`：

```tsx
import { Sidebar } from './sidebar'
import { CommandPalette } from './command-palette'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-8">{children}</div>
      </main>
      <CommandPalette />
    </div>
  )
}
```

- [ ] **步骤 4：验证构建**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 5：Commit**

```bash
git add src/components/command-palette.tsx src/components/app-shell.tsx package.json package-lock.json
git commit -m "feat: Cmd+K 全局搜索命令面板"
```

---

### 任务 6：分享链接 — 数据库迁移

**文件：**
- 创建：`supabase/migrations/006_share_token.sql`

- [ ] **步骤 1：创建迁移脚本**

```sql
-- 006: 为 episodes 添加分享 token 列
ALTER TABLE public.episodes ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

-- 索引：通过 token 快速查找
CREATE INDEX IF NOT EXISTS idx_episodes_share_token ON public.episodes(share_token) WHERE share_token IS NOT NULL;
```

- [ ] **步骤 2：推送迁移**

运行：
```powershell
$env:SUPABASE_ACCESS_TOKEN = "<your-token>"
$supabase = "$env:TEMP\supabase-cli\extracted\supabase.exe"
& $supabase db push
```
预期：`006_share_token.sql` 应用成功

- [ ] **步骤 3：Commit**

```bash
git add supabase/migrations/006_share_token.sql
git commit -m "feat(share): 添加 share_token 列迁移"
```

---

### 任务 7：分享 API

**文件：**
- 创建：`src/app/api/episodes/[id]/share/route.ts`

- [ ] **步骤 1：创建分享链接 API**

```typescript
// src/app/api/episodes/[id]/share/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // 确认归属
  const { data: episode } = await supabase
    .from('episodes')
    .select('id, share_token, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!episode) return NextResponse.json({ error: '节目不存在' }, { status: 404 })
  if (episode.status !== 'completed') {
    return NextResponse.json({ error: '仅已完成的节目可分享' }, { status: 400 })
  }

  // 已有 token 直接返回
  if (episode.share_token) {
    return NextResponse.json({ share_token: episode.share_token })
  }

  // 生成 token
  const token = randomBytes(16).toString('hex')
  const { error } = await supabase
    .from('episodes')
    .update({ share_token: token })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ share_token: token })
}

// DELETE 取消分享
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('episodes')
    .update({ share_token: null })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **步骤 2：验证构建**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/app/api/episodes/[id]/share/route.ts
git commit -m "feat(share): 生成/取消分享链接 API"
```

---

### 任务 8：公开分享页

**文件：**
- 创建：`src/app/share/[token]/page.tsx`

- [ ] **步骤 1：创建公开分享页**

```tsx
// src/app/share/[token]/page.tsx
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { Metadata } from 'next'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const admin = createAdminClient()
  const { data: episode } = await admin
    .from('episodes')
    .select('title, topic')
    .eq('share_token', token)
    .single()

  return {
    title: episode?.title || episode?.topic || '播客分享',
    description: '来自 PodCast AI 的播客节目',
  }
}

export default async function SharePage({ params }: Props) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: episode } = await admin
    .from('episodes')
    .select('id, title, topic, audio_url, show_notes, chapters, completed_at, status')
    .eq('share_token', token)
    .single()

  if (!episode || episode.status !== 'completed' || !episode.audio_url) {
    notFound()
  }

  const chapters = (episode.chapters as { title: string; start: number }[]) || []

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-16">
        {/* 标题 */}
        <h1 className="text-2xl font-bold">{episode.title || episode.topic}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {episode.completed_at ? new Date(episode.completed_at).toLocaleDateString('zh-CN') : ''}
          {' · '}PodCast AI 制作
        </p>

        {/* 播放器 */}
        <audio
          src={episode.audio_url}
          controls
          className="mt-6 w-full"
        />

        {/* 章节 */}
        {chapters.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">章节</h2>
            <ol className="space-y-1">
              {chapters.map((ch, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-12 shrink-0 text-muted-foreground">
                    {Math.floor(ch.start / 60)}:{String(Math.floor(ch.start % 60)).padStart(2, '0')}
                  </span>
                  <span>{ch.title}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Show Notes */}
        {episode.show_notes && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">节目笔记</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {episode.show_notes}
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 border-t pt-6 text-center">
          <p className="text-sm text-muted-foreground">由 PodCast AI 自动生成</p>
          <a href="/login" className="mt-2 inline-block text-sm text-primary hover:underline">
            创建你自己的播客 →
          </a>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **步骤 2：验证构建**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/app/share/[token]/page.tsx
git commit -m "feat(share): 公开分享页（无需登录）"
```

---

### 任务 9：详情页分享按钮

**文件：**
- 修改：`src/components/episode/episode-detail.tsx`

- [ ] **步骤 1：在详情页操作区添加分享按钮**

在 episode-detail.tsx 的操作按钮区域（重新生成/删除按钮旁）添加：

```tsx
const [shareUrl, setShareUrl] = useState<string | null>(null)
const [shareLoading, setShareLoading] = useState(false)

const handleShare = async () => {
  setShareLoading(true)
  try {
    const res = await fetch(`/api/episodes/${episode.id}/share`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '生成链接失败')
    const url = `${window.location.origin}/share/${data.share_token}`
    setShareUrl(url)
    await navigator.clipboard.writeText(url)
    toast.success('分享链接已复制到剪贴板')
  } catch (e) {
    toast.error((e as Error).message)
  } finally {
    setShareLoading(false)
  }
}
```

按钮 JSX（仅 completed 状态显示）：

```tsx
{episode.status === 'completed' && (
  <Button size="sm" variant="outline" onClick={handleShare} disabled={shareLoading}>
    {shareLoading ? '生成中...' : '🔗 分享'}
  </Button>
)}
```

- [ ] **步骤 2：验证构建**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/components/episode/episode-detail.tsx
git commit -m "feat(share): 详情页分享按钮（复制链接到剪贴板）"
```

---

### 任务 10：端到端验证

- [ ] **步骤 1：启动 dev server**

运行：`npm run dev`

- [ ] **步骤 2：验证 Cmd+K**

打开 http://localhost:3000/dashboard，按 Ctrl+K，输入"AI"，确认出现节目搜索结果，点击跳转正常。

- [ ] **步骤 3：验证批量操作**

打开 /episodes，勾选 2 个失败节目，点击「批量删除」，确认消失。

- [ ] **步骤 4：验证分享**

打开一个 completed 节目详情，点击「🔗 分享」，确认链接复制成功。新开无痕窗口访问该链接，确认无需登录即可播放。

- [ ] **步骤 5：验证音色试听**

打开 /create → 脚本模式 → 输入结构化脚本 → 进入 Step 2 → 点击音色旁 ▶️ 按钮，确认音频播放。

- [ ] **步骤 6：最终 Commit**

```bash
git add -A
git commit -m "feat: 产品打磨 Phase 2 完成（音色试听+批量操作+Cmd+K+分享页）"
```
