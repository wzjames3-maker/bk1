# 内容质量 + 创建体验 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 4 种对话风格真正驱动编剧、在 `script_ready` 支持 AI 整段/单句改稿（每集 3 次）、结构化 Show Notes，并修好创建向导默认值/项目选择/音色提示。

**架构：** 新增 `style-presets` 注入 `deepseek.generateScript`；新增 `rewriteScript`/`rewriteSegment` + `POST .../rewrite`（立即写回 script、配额与并发门禁）；`post-process` 输出结构化 JSON 写入 `show_notes`；向导默认 1 人并传 `project_id`。不改 pipeline 状态机与 DB schema。

**技术栈：** Next.js 16、React 19、TypeScript、Supabase、OpenAI-compatible（DeepSeek/SenseNova）、shadcn/ui

**规格：** `docs/superpowers/specs/2026-07-22-content-quality-create-ux-design.md`

**验证约定：** 仓库暂无单元测试框架。纯函数用 `npx tsx` 跑小型 assert 脚本；接口/UI 用 `npm run lint`、`npx tsc --noEmit` 与手测清单。不要为 TDD 引入新测试框架（YAGNI）。

---

## 文件结构

| 路径 | 职责 |
|------|------|
| `src/lib/services/style-presets.ts` | 新建：风格预设、禁词、字数系数、拼 system 片段 |
| `src/lib/services/show-notes.ts` | 新建：解析/序列化 show_notes JSON，纯文本兼容 |
| `src/lib/services/deepseek.ts` | 改：接入 presets；新增 rewrite 函数 |
| `src/lib/services/post-process.ts` | 改：结构化 summary/highlights/chapter_titles |
| `src/lib/pipeline/steps/post.ts` | 改：组装 JSON show_notes |
| `src/app/api/episodes/[id]/rewrite/route.ts` | 新建：改稿 API |
| `src/app/api/episodes/[id]/route.ts` | 改：PATCH script 仅 script_ready |
| `src/app/api/episodes/route.ts` | 改：roles_count 默认 1 |
| `src/components/episode/episode-detail.tsx` | 改：整段润色入口 + 次数展示 |
| `src/components/episode/script-editor.tsx` | 改：单句重写 |
| `src/components/episode/show-notes.tsx` | 改：结构化展示 + 复制 |
| `src/components/create/create-wizard.tsx` | 改：默认 1 人、project_id 提交 |
| `src/components/create/step-params.tsx` | 改：项目 Select、音色文案 |
| `src/types/database.ts` | 改：params 扩展 rewrite_count 等 |
| `NEXT_STEPS.md` | 改：本轮完成后更新状态 |

**自检方式：** 仅用 `npx tsx -e "..."` 内联 assert，**不**新增 `scripts/assert-*.mjs`。

---

### 任务 1：style-presets + 编剧接入

**文件：**
- 创建：`src/lib/services/style-presets.ts`
- 修改：`src/lib/services/deepseek.ts`

- [ ] **步骤 1：创建 `src/lib/services/style-presets.ts`**

```ts
export type PodcastStyle = 'casual' | 'deep' | 'news' | 'story'

export const FORBIDDEN_PHRASES = [
  '综上所述',
  '首先其次再次',
  '赋能',
  '抓手',
  '闭环',
  '旨在',
  '具有重要意义',
] as const

const PRESETS: Record<
  PodcastStyle,
  { label: string; factor: number; rules: string }
> = {
  casual: {
    label: '轻松闲聊',
    factor: 1.0,
    rules: '轻松闲聊：短句、语气词、接梗/吐槽；像朋友聊天，少正式过渡。',
  },
  deep: {
    label: '深度对谈',
    factor: 1.1,
    rules: '深度对谈：追问「为什么/怎么做」；有论点与反例；少口号。',
  },
  news: {
    label: '新闻播报',
    factor: 0.9,
    rules: '新闻播报：先结论后背景；信息密度高；少口头禅与闲扯。',
  },
  story: {
    label: '故事叙述',
    factor: 1.15,
    rules: '故事叙述：有场景与情绪弧；用细节带人；结尾收束主题。',
  },
}

export function normalizeStyle(style: string): PodcastStyle {
  if (style in PRESETS) return style as PodcastStyle
  return 'casual'
}

export function getStylePreset(style: string) {
  return PRESETS[normalizeStyle(style)]
}

export function targetCharCount(durationMin: number, style: string): number {
  const { factor } = getStylePreset(style)
  return Math.round(durationMin * 250 * factor)
}

export function buildStyleSystemAppendix(style: string): string {
  const preset = getStylePreset(style)
  const banned = FORBIDDEN_PHRASES.join('、')
  return `
风格（${preset.label}）：
${preset.rules}

口语硬规则：
- 禁止或尽量避免：${banned}
- 鼓励接话、反问、举例；pause_ms 200-1000 控制节奏
- 严格按角色名说话，不要发明新角色名`
}
```

- [ ] **步骤 2：运行内联自检（tsx）**

```bash
npx --yes tsx -e "
import { normalizeStyle, targetCharCount, buildStyleSystemAppendix, FORBIDDEN_PHRASES } from './src/lib/services/style-presets.ts'
if (normalizeStyle('nope') !== 'casual') throw new Error('normalize')
if (targetCharCount(10, 'news') >= targetCharCount(10, 'story')) throw new Error('factor')
if (!buildStyleSystemAppendix('deep').includes('深度')) throw new Error('appendix')
if (!FORBIDDEN_PHRASES.includes('赋能')) throw new Error('banned')
console.log('style-presets ok', targetCharCount(10,'casual'))
"
```

预期：打印 `style-presets ok 2500`

- [ ] **步骤 4：修改 `deepseek.ts` 的 generateScript**

在文件顶部增加：

```ts
import { buildStyleSystemAppendix, targetCharCount, getStylePreset } from '@/lib/services/style-presets'
```

将 `SYSTEM_PROMPT` 保持为基座，在 `generateScript` 内：

```ts
const system = SYSTEM_PROMPT + '\n' + buildStyleSystemAppendix(style)
const targetChars = targetCharCount(durationMin, style)
const styleLabel = getStylePreset(style).label

const userPrompt = `话题：${topic}
风格：${styleLabel}（code=${style}）
角色：${rolesDesc}（共 ${rolesCount} 人）
目标时长：${durationMin} 分钟（约 ${targetChars} 字）

参考素材：
${materials.slice(0, 8000)}

请返回 JSON 对象，包含非空 segments 数组。`
```

`messages` 使用 `system` 而非裸 `SYSTEM_PROMPT`。

- [ ] **步骤 5：lint + tsc**

```bash
npm run lint
npx tsc --noEmit
```

预期：通过

- [ ] **步骤 6：Commit**

```bash
git add src/lib/services/style-presets.ts src/lib/services/deepseek.ts
git commit -m "feat: style presets drive podcast script generation"
```

---

### 任务 2：rewrite 服务函数（deepseek）

**文件：**
- 修改：`src/lib/services/deepseek.ts`

- [ ] **步骤 1：在 deepseek.ts 增加完整 rewrite 实现（可直接粘贴）**

在 `extractSegments` 后追加以下完整代码（含 retry，无省略）：

```ts
export function assertRolesSubset(
  segments: ScriptSegment[],
  allowedRoles: string[]
): void {
  const allowed = new Set(allowedRoles)
  for (const seg of segments) {
    if (!allowed.has(seg.role)) {
      throw new Error(`Invalid role in rewrite: ${seg.role}`)
    }
  }
  if (segments.length === 0) throw new Error('Empty rewrite segments')
}

function normalizeSegment(raw: Partial<ScriptSegment> & { text?: string; role?: string }): ScriptSegment {
  return {
    role: String(raw.role || '').trim(),
    text: String(raw.text || '').trim(),
    emotion: String(raw.emotion || '中性'),
    pause_ms: Math.min(1000, Math.max(200, Number(raw.pause_ms) || 300)),
  }
}

async function chatJson(
  system: string,
  userPrompt: string,
  maxTokens = 8192
): Promise<{ content: string; tokenUsage: { prompt: number; completion: number } }> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      })
      const message = response.choices[0]?.message as {
        content?: string | null
        reasoning_content?: string | null
      } | undefined
      const content = message?.content || message?.reasoning_content
      if (!content) throw new Error('Empty response from DeepSeek')
      return {
        content,
        tokenUsage: {
          prompt: response.usage?.prompt_tokens || 0,
          completion: response.usage?.completion_tokens || 0,
        },
      }
    } catch (err) {
      lastError = err as Error
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }
  throw new Error(`DeepSeek failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}

export async function rewriteScript(input: {
  topic: string
  style: string
  segments: ScriptSegment[]
  instruction?: string
}): Promise<{ segments: ScriptSegment[]; tokenUsage: { prompt: number; completion: number } }> {
  const instruction = input.instruction?.trim() || '更口语、更紧凑，保持事实与角色不变'
  const roles = [...new Set(input.segments.map(s => s.role))]
  const system =
    SYSTEM_PROMPT +
    '\n' +
    buildStyleSystemAppendix(input.style) +
    `\n你正在润色已有脚本。禁止新增角色。允许的角色名：${roles.join('、')}。只返回完整 segments JSON。`

  const userPrompt = `话题：${input.topic}
润色要求：${instruction}

原脚本 JSON：
${JSON.stringify({ segments: input.segments }).slice(0, 12000)}`

  const { content, tokenUsage } = await chatJson(system, userPrompt, 8192)
  const segments = extractSegments(content).map(normalizeSegment)
  assertRolesSubset(segments, roles)
  return { segments, tokenUsage }
}

export async function rewriteSegment(input: {
  topic: string
  style: string
  segments: ScriptSegment[]
  segmentIndex: number
  instruction?: string
}): Promise<{ segments: ScriptSegment[]; tokenUsage: { prompt: number; completion: number } }> {
  const { segmentIndex, segments } = input
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= segments.length) {
    throw new Error('segmentIndex out of range')
  }
  const instruction = input.instruction?.trim() || '改写得更自然口语，保持原意与角色'
  const target = segments[segmentIndex]
  const roles = [...new Set(segments.map(s => s.role))]

  const system = `你是播客台词润色助手。只改写指定一句。返回 JSON：{"text":"...","emotion":"...","pause_ms":300}
角色名必须仍是：${target.role}。禁止改角色名。`

  const userPrompt = `话题：${input.topic}
要求：${instruction}
上下文（前后各最多 2 段）：
${JSON.stringify(segments.slice(Math.max(0, segmentIndex - 2), segmentIndex + 3))}
待改写：${JSON.stringify(target)}`

  const { content, tokenUsage } = await chatJson(system, userPrompt, 1024)
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const parsed = JSON.parse(cleaned) as { text?: string; emotion?: string; pause_ms?: number }
  if (!parsed.text || !String(parsed.text).trim()) {
    throw new Error('Empty segment rewrite text')
  }
  const next = segments.map((s, i) =>
    i === segmentIndex
      ? normalizeSegment({
          ...s,
          text: parsed.text,
          emotion: parsed.emotion ?? s.emotion,
          pause_ms: parsed.pause_ms ?? s.pause_ms,
        })
      : s
  )
  assertRolesSubset(next, roles)
  return { segments: next, tokenUsage }
}
```

可将 `generateScript` 内部 LLM 调用也改为复用 `chatJson`（可选重构，非必须）。

- [ ] **步骤 2：tsc**

```bash
npx tsc --noEmit
```

预期：通过

- [ ] **步骤 3：Commit**

```bash
git add src/lib/services/deepseek.ts
git commit -m "feat: add script polish and segment rewrite LLM helpers"
```

---

### 任务 3：rewrite API + PATCH 门禁 + roles 默认 1

**文件：**
- 创建：`src/app/api/episodes/[id]/rewrite/route.ts`
- 修改：`src/app/api/episodes/[id]/route.ts`
- 修改：`src/app/api/episodes/route.ts`

- [ ] **步骤 1：创建 rewrite 路由**

`src/app/api/episodes/[id]/rewrite/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rewriteScript, rewriteSegment } from '@/lib/services/deepseek'
import type { ScriptSegment } from '@/types/database'

const REWRITE_LIMIT = 3
const LLM_PER_1K = 0.002

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const mode = body.mode as string
  if (mode !== 'polish' && mode !== 'segment') {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }

  // 所有输入校验必须在占锁之前完成
  let segmentIndex: number | undefined
  if (mode === 'segment') {
    segmentIndex = Number(body.segmentIndex)
    if (!Number.isInteger(segmentIndex)) {
      return NextResponse.json({ error: 'segmentIndex required' }, { status: 400 })
    }
  }

  const { data: episode } = await supabase
    .from('episodes')
    .select('id, user_id, status, topic, script, params')
    .eq('id', id)
    .single()

  if (!episode || episode.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (episode.status !== 'script_ready') {
    return NextResponse.json(
      { error: `Cannot rewrite in status: ${episode.status}` },
      { status: 400 }
    )
  }

  const paramsObj = (episode.params || {}) as Record<string, unknown>
  const rewriteCount = Number(paramsObj.rewrite_count || 0)
  if (rewriteCount >= REWRITE_LIMIT) {
    return NextResponse.json(
      { error: `本集 AI 改稿次数已用完（${REWRITE_LIMIT}/${REWRITE_LIMIT}），请手动编辑` },
      { status: 429 }
    )
  }
  if (paramsObj.rewrite_in_progress === true) {
    return NextResponse.json({ error: 'Rewrite already in progress' }, { status: 409 })
  }

  const script: ScriptSegment[] =
    typeof episode.script === 'string'
      ? JSON.parse(episode.script)
      : episode.script || []

  if (!script.length) {
    return NextResponse.json({ error: 'Empty script' }, { status: 400 })
  }
  if (mode === 'segment' && (segmentIndex! < 0 || segmentIndex! >= script.length)) {
    return NextResponse.json({ error: 'segmentIndex out of range' }, { status: 400 })
  }

  // 占锁（仅 script_ready；写回时 re-read params 再 merge，避免覆盖并发字段）
  await supabase
    .from('episodes')
    .update({
      params: { ...paramsObj, rewrite_in_progress: true },
    })
    .eq('id', id)
    .eq('user_id', user.id)

  try {
    const style = String(paramsObj.style || 'casual')
    const instruction =
      typeof body.instruction === 'string' ? body.instruction : undefined

    let result: { segments: ScriptSegment[]; tokenUsage: { prompt: number; completion: number } }

    if (mode === 'polish') {
      result = await rewriteScript({
        topic: episode.topic,
        style,
        segments: script,
        instruction,
      })
    } else {
      result = await rewriteSegment({
        topic: episode.topic,
        style,
        segments: script,
        segmentIndex: segmentIndex!,
        instruction,
      })
    }

    // re-read params 再 merge，降低覆盖 tts_segments 等字段的风险
    const { data: fresh } = await supabase
      .from('episodes')
      .select('params')
      .eq('id', id)
      .single()
    const freshParams = (fresh?.params || paramsObj) as Record<string, unknown>
    const nextCount = rewriteCount + 1
    const nextParams = {
      ...freshParams,
      rewrite_count: nextCount,
      rewrite_in_progress: false,
    }

    const { error: upErr } = await supabase
      .from('episodes')
      .update({
        script: result.segments,
        params: nextParams,
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (upErr) throw new Error(upErr.message)

    const totalTokens = result.tokenUsage.prompt + result.tokenUsage.completion
    const cost = (totalTokens / 1000) * LLM_PER_1K
    await supabase.from('usage_logs').insert({
      user_id: user.id,
      episode_id: id,
      type: 'llm_token',
      quantity: totalTokens,
      cost,
    })

    return NextResponse.json({
      script: result.segments,
      rewrite_count: nextCount,
      rewrite_limit: REWRITE_LIMIT,
    })
  } catch (err) {
    const { data: fresh } = await supabase
      .from('episodes')
      .select('params')
      .eq('id', id)
      .single()
    const freshParams = (fresh?.params || paramsObj) as Record<string, unknown>
    await supabase
      .from('episodes')
      .update({
        params: { ...freshParams, rewrite_in_progress: false },
      })
      .eq('id', id)
      .eq('user_id', user.id)

    return NextResponse.json(
      { error: (err as Error).message || 'Rewrite failed' },
      { status: 502 }
    )
  }
}
```

- [ ] **步骤 2：PATCH 门禁 — `src/app/api/episodes/[id]/route.ts`**

在 `PATCH` 中，当 `body.script !== undefined` 时先查 episode：

```ts
if (body.script !== undefined) {
  const { data: ep } = await supabase
    .from('episodes')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!ep) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ep.status !== 'script_ready') {
    return NextResponse.json(
      { error: `Cannot edit script in status: ${ep.status}` },
      { status: 400 }
    )
  }
  allowedFields.script = body.script
}
```

- [ ] **步骤 3：创建 API 默认 roles — `src/app/api/episodes/route.ts`**

将：

```ts
const rolesCount = Math.min(Math.max(Number(params.roles_count) || 2, 1), 10)
```

改为：

```ts
const rolesCount = Math.min(Math.max(Number(params.roles_count) || 1, 1), 10)
```

- [ ] **步骤 4：lint + tsc**

```bash
npm run lint
npx tsc --noEmit
```

- [ ] **步骤 5：Commit**

```bash
git add src/app/api/episodes/\[id\]/rewrite/route.ts src/app/api/episodes/\[id\]/route.ts src/app/api/episodes/route.ts
git commit -m "feat: episode AI rewrite API with quota and script PATCH guard"
```

---

### 任务 4：详情页 / ScriptEditor UI

**文件：**
- 修改：`src/components/episode/episode-detail.tsx`
- 修改：`src/components/episode/script-editor.tsx`

- [ ] **步骤 1：EpisodeDetail 增加整段润色 + 本地 script 覆盖**

**必须：** rewrite 成功后立刻用返回的 `data.script` 更新本地展示，不能只靠 `router.refresh()`（ScriptEditor 用 useState 初始化，props 变了也不会自动同步）。

```tsx
const [rewriting, setRewriting] = useState(false)
const [scriptOverride, setScriptOverride] = useState<ScriptSegment[] | null>(null)
const [rewriteCountLocal, setRewriteCountLocal] = useState<number | null>(null)

const baseScript: ScriptSegment[] = typeof episode.script === 'string'
  ? JSON.parse(episode.script)
  : episode.script || []
const script = scriptOverride ?? baseScript

const rewriteCount = rewriteCountLocal ?? Number(
  (episode.params as { rewrite_count?: number })?.rewrite_count || 0
)
const rewriteLimit = 3

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
    router.refresh()
  } catch (e) {
    alert((e as Error).message)
  } finally {
    setRewriting(false)
  }
}
```

- ScriptEditor / ScriptViewer 使用上面的 `script`（含 override）
- 传入 `key={script.map(s => s.text).join('|').slice(0, 80)}` 或 `key={rewriteCount}` 强制 remount 亦可
- `onScriptReplaced={(s) => { setScriptOverride(s); setRewriteCountLocal(c => (c ?? rewriteCount) + 1) }}`（segment 时以 API 返回的 rewrite_count 为准更稳）
- 扩展 `database.ts` 中 `Episode.params`：`rewrite_count?: number; rewrite_in_progress?: boolean; voice_ids?: string[]; ...`

- [ ] **步骤 2：ScriptEditor 支持单句重写**

扩展 props：

```ts
interface Props {
  script: ScriptSegment[]
  onSave: (script: ScriptSegment[]) => Promise<void>
  onCancel: () => void
  episodeId?: string
  onScriptReplaced?: (script: ScriptSegment[]) => void
  rewriteDisabled?: boolean
}
```

每段增加按钮：

```tsx
{episodeId && (
  <Button
    variant="ghost"
    size="sm"
    disabled={rewriteDisabled || rewritingIndex === i}
    onClick={async () => {
      setRewritingIndex(i)
      try {
        const res = await fetch(`/api/episodes/${episodeId}/rewrite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'segment', segmentIndex: i }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '重写失败')
        setSegments(data.script)
        onScriptReplaced?.(data.script)
      } catch (e) {
        alert((e as Error).message)
      } finally {
        setRewritingIndex(null)
      }
    }}
  >
    {rewritingIndex === i ? '重写中...' : '重写此句'}
  </Button>
)}
```

详情页传入 `episodeId={episode.id}` 与 `rewriteDisabled={rewriteCount >= 3 || rewriting}`。

- [ ] **步骤 3：lint + tsc**

```bash
npm run lint
npx tsc --noEmit
```

- [ ] **步骤 4：Commit**

```bash
git add src/components/episode/episode-detail.tsx src/components/episode/script-editor.tsx src/types/database.ts
git commit -m "feat: UI for AI polish and per-segment rewrite"
```

---

### 任务 5：结构化 Show Notes

**文件：**
- 创建：`src/lib/services/show-notes.ts`
- 修改：`src/lib/services/post-process.ts`
- 修改：`src/lib/pipeline/steps/post.ts`
- 修改：`src/components/episode/show-notes.tsx`

- [ ] **步骤 1：创建 show-notes 工具**

```ts
// src/lib/services/show-notes.ts
export interface ShowNotesPayload {
  summary: string
  highlights: string[]
  chapters: Array<{ time: string; title: string }>
}

export function parseShowNotes(raw: string | null | undefined): ShowNotesPayload | { plain: string } | null {
  if (!raw || !raw.trim()) return null
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && typeof obj.summary === 'string') {
      return {
        summary: obj.summary,
        highlights: Array.isArray(obj.highlights) ? obj.highlights.map(String) : [],
        chapters: Array.isArray(obj.chapters)
          ? obj.chapters.map((c: { time?: string; title?: string }) => ({
              time: String(c.time || ''),
              title: String(c.title || ''),
            }))
          : [],
      }
    }
  } catch {
    // fallthrough
  }
  return { plain: raw }
}

export function serializeShowNotes(payload: ShowNotesPayload): string {
  return JSON.stringify(payload)
}

export function formatShowNotesForCopy(payload: ShowNotesPayload): string {
  const lines = [payload.summary, '', '要点：', ...payload.highlights.map((h, i) => `${i + 1}. ${h}`)]
  if (payload.chapters.length) {
    lines.push('', '章节：')
    for (const ch of payload.chapters) {
      lines.push(`${ch.time} ${ch.title}`)
    }
  }
  return lines.join('\n')
}
```

- [ ] **步骤 2：改 `post-process.ts` 返回结构**

```ts
interface PostProcessResult {
  summary: string
  highlights: string[]
  coverSuggestion: string
  chapterTitles?: string[]
}
```

system prompt 要求：

```text
严格返回 JSON：
{
  "summary": "100-200字简介",
  "highlights": ["要点1","要点2","要点3"],
  "cover_suggestion": "标题 + 副标题",
  "chapter_titles": ["具体标题", ...]  // 若需要 N 个
}
章节标题 4-12 字，禁止：开场、总结、第一部分、第二部分、结尾、引言
不要生成时间戳
```

解析时兼容旧字段 `show_notes` 作为 summary 回退。

- [ ] **步骤 3：改 `post.ts` 组装**

```ts
import { serializeShowNotes } from '@/lib/services/show-notes'

const { summary, highlights, coverSuggestion, chapterTitles } = await generatePostContent(...)

// 应用 chapterTitles 到 chapters 后：
const show_notes = serializeShowNotes({
  summary,
  highlights,
  chapters, // 已含真实 time
})

await supabase.from('episodes').update({
  show_notes,
  chapters: JSON.stringify(chapters),
  cover_url: coverSuggestion,
})
```

- [ ] **步骤 4：改 `ShowNotes` 组件**

```tsx
'use client'
import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { parseShowNotes, formatShowNotesForCopy, type ShowNotesPayload } from '@/lib/services/show-notes'

export function ShowNotes({ showNotes, coverSuggestion }: { showNotes: string | null; coverSuggestion: string | null }) {
  const parsed = useMemo(() => parseShowNotes(showNotes), [showNotes])

  if (!parsed && !coverSuggestion) {
    return <p className="text-sm text-muted-foreground">后处理完成后自动生成</p>
  }

  if (parsed && 'plain' in parsed) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">节目简介</CardTitle></CardHeader>
        <CardContent><p className="text-sm whitespace-pre-wrap">{parsed.plain}</p></CardContent>
      </Card>
    )
  }

  const data = parsed as ShowNotesPayload | null

  return (
    <div className="space-y-4">
      {data && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(formatShowNotesForCopy(data))}
          >
            复制全部
          </Button>
        </div>
      )}
      {data?.summary && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">节目简介</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap leading-relaxed">{data.summary}</p></CardContent>
        </Card>
      )}
      {data && data.highlights.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">要点</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {data.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}
      {data && data.chapters.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">章节</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.chapters.map((ch, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-muted-foreground font-mono w-14">{ch.time}</span>
                <span>{ch.title}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {coverSuggestion && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">封面建议</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">{coverSuggestion}</p></CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **步骤 5：tsx 自检 parse**

```bash
npx --yes tsx -e "
import { parseShowNotes, serializeShowNotes } from './src/lib/services/show-notes.ts'
const s = serializeShowNotes({ summary: 'a', highlights: ['b'], chapters: [{ time: '00:00', title: 't' }] })
const p = parseShowNotes(s)
if (!p || 'plain' in p || p.summary !== 'a') throw new Error('json')
if (!('plain' in (parseShowNotes('hello') as object))) throw new Error('plain')
console.log('show-notes ok')
"
```

- [ ] **步骤 6：lint + tsc + commit**

```bash
npm run lint && npx tsc --noEmit
git add src/lib/services/show-notes.ts src/lib/services/post-process.ts src/lib/pipeline/steps/post.ts src/components/episode/show-notes.tsx
git commit -m "feat: structured show notes with highlights and chapters copy"
```

---

### 任务 6：创建向导体验

**文件：**
- 修改：`src/components/create/create-wizard.tsx`
- 修改：`src/components/create/step-params.tsx`
- 视情况修改：`src/components/ui/select.tsx`（仅当确认 pointer-events/遮罩问题）

- [ ] **步骤 1：向导默认 roles_count = 1**

`create-wizard.tsx`：

```ts
const [params, setParams] = useState<EpisodeParams>({
  duration_min: 10,
  style: 'casual',
  roles_count: 1,
  voice_ids: [],
  bgm: 'light',
  skip_confirmation: false,
})
const [projectId, setProjectId] = useState<string | null>(null)
```

`handleSubmit` body 增加：

```ts
project_id: projectId || undefined,
```

- [ ] **步骤 2：StepParams 增加项目选择**

扩展 Props：

```ts
interface Props {
  params: EpisodeParams
  onChange: (params: EpisodeParams) => void
  projectId: string | null
  onProjectIdChange: (id: string | null) => void
}
```

组件内：

```ts
const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
useEffect(() => {
  fetch('/api/projects')
    .then(r => r.json())
    .then((list) => {
      if (!Array.isArray(list)) return
      setProjects(list)
      if (!projectId && list[0]?.id) onProjectIdChange(list[0].id)
    })
    .catch(console.error)
}, [])
```

UI：在时长/风格网格上方或旁侧加：

```tsx
<div className="space-y-2">
  <Label>归属项目</Label>
  <Select
    value={projectId ?? undefined}
    onValueChange={(v) => onProjectIdChange(v || null)}
  >
    <SelectTrigger><SelectValue placeholder="选择项目" /></SelectTrigger>
    <SelectContent>
      {projects.map(p => (
        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

音色区已有「已选 x/n」文案；确认 `canNext` 仍要求 `voice_ids.length === roles_count`。若未满，在 VoicePicker 下增加红色提示（`text-destructive`）当 `voice_ids.length !== roles_count`。

- [ ] **步骤 3：CreateWizard 传入 project props**

```tsx
<StepParams
  params={params}
  projectId={projectId}
  onProjectIdChange={setProjectId}
  onChange={...}
/>
```

- [ ] **步骤 4：Select 可点性**

当前 `select.tsx` 已是 Portal + `z-50`。**先手测**（打开风格 Select → 选「深度对谈」→ 点下一步）。

- 若真机 UI 正常、仅 Playwright 点不到：不要改共享 Select；验收记 workaround（Escape 关闭后点下一步 / 用键盘）。
- 若真机也被挡：再查是否有全屏 overlay；必要时给创建页 `SelectContent` 提高 z-index 或检查父级 `overflow`。

- [ ] **步骤 5：lint + tsc + commit**

```bash
npm run lint && npx tsc --noEmit
git add src/components/create/create-wizard.tsx src/components/create/step-params.tsx src/components/ui/select.tsx
git commit -m "feat: create wizard defaults, project pick, voice hints"
```

---

### 任务 7：收尾文档与全量验收

**文件：**
- 修改：`NEXT_STEPS.md`

- [ ] **步骤 1：更新 NEXT_STEPS.md**

- 最近提交改为本轮 commits
- 删除「未提交改动」过时列表
- P0/P1 中标记「风格/改稿/Show Notes/创建向导」为已完成（若验收通过）
- 保留密钥轮换、Redis、部署等未做项

- [ ] **步骤 2：全量静态检查**

```bash
npm run lint
npx tsc --noEmit
```

预期：全部通过

- [ ] **步骤 3：手测清单（规格 §6）**

```text
[ ] 风格差异：同话题 casual vs deep（可短时长 + skip 或停在 script_ready 看脚本）
[ ] polish 成功 rewrite_count=1
[ ] segment 重写成功
[ ] 第 4 次 AI 改稿 429
[ ] 非 script_ready PATCH script / rewrite → 400
[ ] 手改 → 确认 → 完成
[ ] Show Notes 三块 + 复制；旧纯文本仍显示
[ ] /create 默认 1 人、项目归属、Select 可点
```

- [ ] **步骤 4：Commit 文档**

```bash
git add NEXT_STEPS.md
git commit -m "docs: update NEXT_STEPS after content quality UX delivery"
```

---

## 规格覆盖自检

| 规格需求 | 任务 |
|----------|------|
| 风格预设 + 口语硬规则 | 任务 1 |
| rewrite 服务 | 任务 2 |
| rewrite API / 配额 / 并发 / usage | 任务 3 |
| PATCH script 门禁 | 任务 3 |
| roles 默认 1（服务端） | 任务 3 |
| 详情润色 + 编辑器单句 | 任务 4 |
| 结构化 show_notes + UI | 任务 5 |
| 向导 UX + project_id | 任务 6 |
| Select 遮罩 | 任务 6 |
| NEXT_STEPS + 验收 | 任务 7 |
| 不改状态机 / 无 schema migration | 全任务遵守 |
| skip_confirmation 默认 false | 任务 6 保持 |
| cover_url 仍为建议文案 | 任务 5 保持 |

## 占位符扫描

无 TODO/待定。任务 2 rewrite 为完整可粘贴实现；任务 3 校验在占锁前 + params re-read merge；任务 4 使用 scriptOverride；自检仅 tsx -e。

## 类型一致性

- `ScriptSegment`：`role/text/emotion/pause_ms` 与现有 `database.ts` 一致
- rewrite 响应：`{ script, rewrite_count, rewrite_limit }`
- `ShowNotesPayload`：`summary/highlights/chapters`
- mode：`'polish' | 'segment'`
