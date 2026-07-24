# 历史作品管理（查看、删除、重新生成）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为用户提供完整的播客作品生命周期管理——分页浏览历史作品、安全删除、一键重新生成。

**架构：** 新增 `/episodes` 独立列表页（服务端渲染 + 客户端筛选），复用现有 `DELETE /api/episodes/[id]` 并增加 Storage 清理，新增 `POST /api/episodes/[id]/regenerate` 克隆已有 episode 参数创建新任务并重新走 pipeline。

**技术栈：** Next.js App Router (Server Components + Client Actions)、Supabase JS、shadcn/ui、Supabase Storage

---

## 文件结构

| 操作 | 路径 | 职责 |
|------|------|------|
| 创建 | `src/app/(app)/episodes/page.tsx` | 作品列表页（SSR，支持 status 筛选 + 分页） |
| 创建 | `src/components/episodes/episode-list.tsx` | 客户端列表组件（筛选交互、删除确认、重新生成） |
| 创建 | `src/components/episodes/delete-dialog.tsx` | 删除确认对话框 |
| 创建 | `src/app/api/episodes/[id]/regenerate/route.ts` | 重新生成 API（克隆 + 扣费 + 触发 pipeline） |
| 修改 | `src/app/api/episodes/[id]/route.ts` | DELETE 增加 Storage 音频清理 |
| 修改 | `src/components/episode/episode-detail.tsx` | 详情页增加删除 + 重新生成按钮 |
| 修改 | `src/components/sidebar.tsx` | 侧边栏增加「我的作品」导航项 |
| 修改 | `src/types/database.ts` | 新增 `RegenerateResponse` 类型 |

---

### 任务 1：作品列表 API（GET /api/episodes 分页 + 筛选）

**文件：**
- 修改：`src/app/api/episodes/route.ts`

- [ ] **步骤 1：在现有 GET handler 中增加分页和筛选参数**

当前 `src/app/api/episodes/route.ts` 只有 POST。在文件顶部（POST 之前）新增 GET handler：

```typescript
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // 'all' | 'processing' | 'completed' | 'failed'
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('episodes')
    .select('id, title, topic, status, created_at, audio_url, estimated_cost, completed_at', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status === 'completed') {
    query = query.eq('status', 'completed')
  } else if (status === 'failed') {
    query = query.eq('status', 'failed')
  } else if (status === 'processing') {
    query = query.in('status', ['pending', 'parsing', 'scripting', 'confirming', 'tts_processing', 'mixing', 'post_processing'])
  }
  // status === 'all' 或 null → 不筛选

  const { data: episodes, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    episodes: episodes || [],
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  })
}
```

- [ ] **步骤 2：验证类型检查通过**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/app/api/episodes/route.ts
git commit -m "feat(episodes): add GET /api/episodes with pagination and status filter"
```

---

### 任务 2：删除 API 增强（Storage 清理）

**文件：**
- 修改：`src/app/api/episodes/[id]/route.ts:85-103`

- [ ] **步骤 1：在 DELETE handler 中增加 Storage 文件清理**

将现有 DELETE handler 替换为：

```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 先查出该 episode 的 user_id 做归属校验
  const { data: episode } = await supabase
    .from('episodes')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!episode || episode.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 删除数据库记录（级联删除 episode_steps）
  const { error } = await supabase
    .from('episodes')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 异步清理 Storage 中的音频文件（不阻塞响应）
  const prefix = `${user.id}/episodes/${id}/`
  supabase.storage
    .from('audio')
    .list(prefix)
    .then(({ data: files }) => {
      if (files && files.length > 0) {
        const paths = files.map(f => `${prefix}${f.name}`)
        supabase.storage.from('audio').remove(paths).catch(() => {})
      }
    })
    .catch(() => {})

  return NextResponse.json({ success: true })
}
```

- [ ] **步骤 2：验证类型检查通过**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/app/api/episodes/[id]/route.ts
git commit -m "feat(episodes): clean up storage audio files on episode delete"
```

---

### 任务 3：重新生成 API

**文件：**
- 创建：`src/app/api/episodes/[id]/regenerate/route.ts`

- [ ] **步骤 1：创建重新生成端点**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { preCharge } from '@/lib/services/billing'
import { estimateCost } from '@/lib/services/cost'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: source } = await admin
    .from('episodes')
    .select('id, user_id, topic, title, materials, params, project_id, status')
    .eq('id', id)
    .single()

  if (!source || source.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 只有已完成或失败的 episode 才能重新生成
  if (!['completed', 'failed'].includes(source.status)) {
    return NextResponse.json(
      { error: '只能对已完成或失败的节目重新生成' },
      { status: 400 }
    )
  }

  const srcParams = source.params as Record<string, unknown>
  const durationMin = Number(srcParams.duration_min) || 10
  const rolesCount = Number(srcParams.roles_count) || 1
  const materials = (source.materials || []) as Array<{ text?: string; extracted_text?: string }>
  const materialCharCount = materials.reduce(
    (sum, m) => sum + ((m.extracted_text || m.text || '').length), 0
  )

  // 计算费用
  const costEstimate = estimateCost({
    duration_min: durationMin,
    roles_count: rolesCount,
    material_char_count: materialCharCount,
  })
  const estimatedCost = costEstimate.total

  // 创建新 episode（克隆参数）
  const { data: newEpisode, error } = await supabase
    .from('episodes')
    .insert({
      user_id: user.id,
      project_id: source.project_id,
      topic: source.topic,
      title: source.title ? `${source.title}（重新生成）` : `${source.topic}（重新生成）`,
      materials: source.materials,
      params: {
        duration_min: durationMin,
        style: srcParams.style || 'casual',
        roles_count: rolesCount,
        voice_ids: srcParams.voice_ids || [],
        bgm: srcParams.bgm || 'none',
        skip_confirmation: false,
        regenerated_from: id,
      },
      estimated_cost: estimatedCost || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 预扣费
  if (estimatedCost > 0) {
    const charged = await preCharge(user.id, estimatedCost, newEpisode.id)
    if (!charged) {
      await supabase.from('episodes').delete().eq('id', newEpisode.id)
      return NextResponse.json({ error: '余额不足，无法重新生成' }, { status: 402 })
    }
  }

  // 触发 pipeline（从 parsing 开始）
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  fetch(`${baseUrl}/api/pipeline/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
    },
    body: JSON.stringify({
      episodeId: newEpisode.id,
      userId: user.id,
      step: 'parsing',
      attempt: 1,
    }),
  }).catch(() => {})

  return NextResponse.json(newEpisode, { status: 201 })
}
```

- [ ] **步骤 2：验证类型检查通过**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/app/api/episodes/[id]/regenerate/route.ts
git commit -m "feat(episodes): add POST /api/episodes/[id]/regenerate"
```

---

### 任务 4：删除确认对话框组件

**文件：**
- 创建：`src/components/episodes/delete-dialog.tsx`

- [ ] **步骤 1：创建删除确认对话框**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Props {
  episodeId: string
  episodeTitle: string
  onDeleted?: () => void
  variant?: 'button' | 'menu-item'
}

export function DeleteDialog({ episodeId, episodeTitle, onDeleted, variant = 'button' }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/episodes/${episodeId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '删除失败')
      }
      setConfirming(false)
      if (onDeleted) {
        onDeleted()
      } else {
        router.push('/episodes')
        router.refresh()
      }
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  if (!confirming) {
    return (
      <Button
        variant={variant === 'menu-item' ? 'ghost' : 'outline'}
        size="sm"
        className={variant === 'menu-item' ? 'w-full justify-start text-destructive' : 'text-destructive'}
        onClick={() => setConfirming(true)}
      >
        🗑️ 删除
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2">
      <span className="text-sm">
        确定删除「{episodeTitle}」？此操作不可恢复。
      </span>
      <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
        {deleting ? '删除中...' : '确认删除'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
        取消
      </Button>
    </div>
  )
}
```

- [ ] **步骤 2：验证类型检查通过**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/components/episodes/delete-dialog.tsx
git commit -m "feat(ui): add DeleteDialog component with inline confirmation"
```

---

### 任务 5：作品列表页面

**文件：**
- 创建：`src/app/(app)/episodes/page.tsx`
- 创建：`src/components/episodes/episode-list.tsx`

- [ ] **步骤 1：创建服务端列表页**

`src/app/(app)/episodes/page.tsx`：

```tsx
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
```

- [ ] **步骤 2：创建客户端列表组件**

`src/components/episodes/episode-list.tsx`：

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { DeleteDialog } from './delete-dialog'

interface EpisodeItem {
  id: string
  title: string | null
  topic: string
  status: string
  created_at: string
  audio_url: string | null
  estimated_cost: number | null
  completed_at: string | null
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
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

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'processing', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
]

export function EpisodeList() {
  const router = useRouter()
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [regenerating, setRegenerating] = useState<string | null>(null)

  const fetchEpisodes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (filter !== 'all') params.set('status', filter)
      const res = await fetch(`/api/episodes?${params}`)
      const data = await res.json()
      setEpisodes(data.episodes || [])
      setTotalPages(data.totalPages || 1)
      setTotal(data.total || 0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filter, page])

  useEffect(() => {
    fetchEpisodes()
  }, [fetchEpisodes])

  const handleRegenerate = async (id: string) => {
    setRegenerating(id)
    try {
      const res = await fetch(`/api/episodes/${id}/regenerate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '重新生成失败')
      router.push(`/episodes/${data.id}`)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setRegenerating(null)
    }
  }

  const handleDeleted = () => {
    fetchEpisodes()
  }

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex items-center gap-2">
        {FILTERS.map(f => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter(f.value); setPage(1) }}
          >
            {f.label}
          </Button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 期</span>
      </div>

      {/* 列表 */}
      {loading ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">加载中...</CardContent></Card>
      ) : episodes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">暂无节目</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {episodes.map(ep => {
            const st = STATUS_MAP[ep.status] || { label: ep.status, variant: 'secondary' as const }
            return (
              <Card key={ep.id} className="transition-colors hover:bg-muted/30">
                <CardContent className="flex items-center gap-4 py-3">
                  <Link href={`/episodes/${ep.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{ep.title || ep.topic || '未命名节目'}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ep.created_at).toLocaleString('zh-CN')}
                      {ep.estimated_cost ? ` · $${Number(ep.estimated_cost).toFixed(4)}` : ''}
                    </p>
                  </Link>
                  <Badge variant={st.variant}>{st.label}</Badge>
                  <div className="flex items-center gap-1">
                    {(ep.status === 'completed' || ep.status === 'failed') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={regenerating === ep.id}
                        onClick={() => handleRegenerate(ep.id)}
                      >
                        {regenerating === ep.id ? '生成中...' : '🔄 重新生成'}
                      </Button>
                    )}
                    <DeleteDialog
                      episodeId={ep.id}
                      episodeTitle={ep.title || ep.topic || '未命名节目'}
                      onDeleted={handleDeleted}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            下一页
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **步骤 3：验证类型检查通过**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add src/app/\(app\)/episodes/page.tsx src/components/episodes/episode-list.tsx
git commit -m "feat(ui): add episodes list page with filter, pagination, delete, regenerate"
```

---

### 任务 6：详情页增加删除 + 重新生成按钮

**文件：**
- 修改：`src/components/episode/episode-detail.tsx`

- [ ] **步骤 1：在 episode-detail 的操作区增加删除和重新生成按钮**

在文件顶部 import 区新增：

```typescript
import { DeleteDialog } from '@/components/episodes/delete-dialog'
```

在 `EpisodeDetailInner` 组件中，找到 `canRetry` 变量定义附近，新增：

```typescript
const canRegenerate = episode.status === 'completed' || episode.status === 'failed'
const [regenerating, setRegenerating] = useState(false)

const handleRegenerate = async () => {
  setRegenerating(true)
  try {
    const res = await fetch(`/api/episodes/${episode.id}/regenerate`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '重新生成失败')
    router.push(`/episodes/${data.id}`)
  } catch (e) {
    alert((e as Error).message)
  } finally {
    setRegenerating(false)
  }
}
```

在 JSX 操作按钮区（`canRetry` 按钮之后）追加：

```tsx
{canRegenerate && (
  <Button variant="outline" onClick={handleRegenerate} disabled={regenerating}>
    {regenerating ? '生成中...' : '🔄 重新生成'}
  </Button>
)}
<DeleteDialog
  episodeId={episode.id}
  episodeTitle={episode.title || episode.topic || '未命名节目'}
/>
```

- [ ] **步骤 2：验证类型检查通过**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/components/episode/episode-detail.tsx
git commit -m "feat(ui): add delete and regenerate buttons to episode detail"
```

---

### 任务 7：侧边栏导航增加「我的作品」

**文件：**
- 修改：`src/components/sidebar.tsx`

- [ ] **步骤 1：在 navItems 数组中增加作品入口**

将 `navItems` 修改为（在「播客项目」之后插入）：

```typescript
const navItems = [
  { href: '/dashboard', label: '工作台', icon: '📊' },
  { href: '/projects', label: '播客项目', icon: '🎙️' },
  { href: '/episodes', label: '我的作品', icon: '📋' },
  { href: '/create', label: '创建节目', icon: '✨' },
  { href: '/billing', label: '账单中心', icon: '💳' },
  { href: '/settings', label: '设置', icon: '⚙️' },
]
```

- [ ] **步骤 2：验证类型检查通过**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(nav): add episodes list link to sidebar"
```

---

### 任务 8：端到端验证

- [ ] **步骤 1：启动开发服务器**

运行：`npm run dev`

- [ ] **步骤 2：验证作品列表页**

访问 `http://localhost:3000/episodes`：
- 页面正常渲染，显示历史节目
- 状态筛选切换正常
- 分页正常

- [ ] **步骤 3：验证删除功能**

- 点击某条节目的「🗑️ 删除」→ 出现确认条
- 点击「确认删除」→ 条目从列表消失
- 刷新页面确认已删除

- [ ] **步骤 4：验证重新生成**

- 对一条 completed/failed 的节目点击「🔄 重新生成」
- 跳转到新 episode 详情页，标题带「（重新生成）」后缀
- 新 episode 进入 pipeline 流程

- [ ] **步骤 5：验证详情页按钮**

访问任一 episode 详情页：
- 操作区显示「重新生成」和「删除」按钮
- 删除后跳转回 `/episodes`

- [ ] **步骤 6：最终 Commit**

```bash
git add -A
git commit -m "feat: episode management - list, delete, regenerate (complete)"
```
