# 用户脚本直传播客生成 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 用户直接提供脚本（纯文本/结构化/文件），系统解析后跳过 AI 编剧，直接生成播客音频。

**架构：** 前端解析脚本为 ScriptSegment[]，提交时携带 script 字段，服务端跳过 parsing+scripting 直接设 status=script_ready，复用现有 confirm→TTS→mix→post 链路。LLM 负责音色匹配和可选润色。

**技术栈：** Next.js 16 / React 19 / TypeScript / DeepSeek API / Supabase / Base UI

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 创建 | `src/lib/services/script-parser.ts` | 脚本解析：自动识别格式，输出 ScriptSegment[] |
| 创建 | `src/lib/services/script-parser.test.ts` | 解析器单元测试 |
| 创建 | `src/lib/services/voice-matcher.ts` | LLM 音色匹配 |
| 创建 | `src/app/api/script/polish/route.ts` | AI 润色 API |
| 创建 | `src/components/create/script-input.tsx` | 脚本输入+预览组件 |
| 修改 | `src/components/create/step-materials.tsx` | 新增模式切换 Tab |
| 修改 | `src/components/create/create-wizard.tsx` | 脚本模式状态管理 |
| 修改 | `src/components/create/step-params.tsx` | 脚本模式下 roles_count 自动 + 音色匹配展示 |
| 修改 | `src/app/api/episodes/route.ts` | 支持 body.script 分支 |
| 修改 | `src/app/api/billing/estimate/route.ts` | 脚本模式精确计费 |
| 修改 | `src/types/database.ts` | CreateEpisodeInput 新增 script 字段 |

---

### 任务 1：脚本解析器

**文件：**
- 创建：`src/lib/services/script-parser.ts`
- 创建：`src/lib/services/script-parser.test.ts`

- [ ] **步骤 1：编写结构化对话解析测试**

```typescript
// src/lib/services/script-parser.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseScript } from './script-parser'

test('parses structured dialogue with Chinese colon', () => {
  const input = `小林：大家好，今天聊AI。
老陈：好，我先说说背景。
小林：对，这个话题很火。
老陈：没错，发展很快。`

  const result = parseScript(input)
  assert.equal(result.length, 4)
  assert.equal(result[0].role, '小林')
  assert.equal(result[0].text, '大家好，今天聊AI。')
  assert.equal(result[1].role, '老陈')
  assert.equal(result[0].emotion, '中性')
  assert.equal(result[0].pause_ms, 300)
})

test('parses structured dialogue with English colon', () => {
  const input = `Host: Welcome to the show.
Guest: Thanks for having me.
Host: Let's dive in.
Guest: Sure thing.`

  const result = parseScript(input)
  assert.equal(result.length, 4)
  assert.equal(result[0].role, 'Host')
  assert.equal(result[0].text, "Welcome to the show.")
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test src/lib/services/script-parser.test.ts`
预期：FAIL，Cannot find module './script-parser'

- [ ] **步骤 3：实现结构化解析**

```typescript
// src/lib/services/script-parser.ts
import type { ScriptSegment } from '@/types/database'

const STRUCTURED_LINE_RE = /^(.{1,10})[：:]\s*(.+)$/

export function parseScript(raw: string): ScriptSegment[] {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  if (isStructured(lines)) {
    return parseStructured(lines)
  }
  return parsePlainText(lines)
}

function isStructured(lines: string[]): boolean {
  const matches = lines.map(l => STRUCTURED_LINE_RE.exec(l)).filter(Boolean)
  if (matches.length / lines.length < 0.6) return false

  const roles = new Map<string, number>()
  for (const m of matches) {
    const role = m![1].trim()
    roles.set(role, (roles.get(role) || 0) + 1)
  }
  if (roles.size > 5) return false
  for (const count of roles.values()) {
    if (count < 2) return false
  }
  return true
}

function parseStructured(lines: string[]): ScriptSegment[] {
  const segments: ScriptSegment[] = []
  for (const line of lines) {
    const m = STRUCTURED_LINE_RE.exec(line)
    if (!m) continue
    segments.push({
      role: m[1].trim(),
      text: m[2].trim(),
      emotion: '中性',
      pause_ms: 300,
    })
  }
  return segments
}

function parsePlainText(lines: string[]): ScriptSegment[] {
  const segments: ScriptSegment[] = []
  for (const line of lines) {
    const chunks = splitLongText(line, 200)
    for (const chunk of chunks) {
      segments.push({
        role: '主播',
        text: chunk,
        emotion: '中性',
        pause_ms: 300,
      })
    }
  }
  return segments
}

function splitLongText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  const sentences = text.split(/(?<=[。？！?!])/)
  let current = ''
  for (const s of sentences) {
    if ((current + s).length > maxLen && current) {
      chunks.push(current.trim())
      current = s
    } else {
      current += s
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}
```

- [ ] **步骤 4：运行测试确认通过**

运行：`node --test src/lib/services/script-parser.test.ts`
预期：PASS

- [ ] **步骤 5：编写纯文本解析测试**

在测试文件追加：

```typescript
test('parses plain text as monologue with role 主播', () => {
  const input = `今天我们来聊聊人工智能的发展。
从最早的专家系统到现在的深度学习，AI经历了巨大的变化。
未来会怎样呢？让我们一起探讨。`

  const result = parseScript(input)
  assert.equal(result.length, 3)
  assert.ok(result.every(s => s.role === '主播'))
})

test('splits long plain text paragraph at sentence boundaries', () => {
  const longLine = '这是第一句话。这是第二句话。'.repeat(20) // >200 chars
  const result = parseScript(longLine)
  assert.ok(result.length > 1)
  assert.ok(result.every(s => s.text.length <= 200))
})

test('returns empty array for empty input', () => {
  assert.deepEqual(parseScript(''), [])
  assert.deepEqual(parseScript('   \n  \n  '), [])
})
```

- [ ] **步骤 6：运行全部测试确认通过**

运行：`node --test src/lib/services/script-parser.test.ts`
预期：全部 PASS

- [ ] **步骤 7：Commit**

```bash
git add src/lib/services/script-parser.ts src/lib/services/script-parser.test.ts
git commit -m "feat: add script parser with auto format detection"
```

---

### 任务 2：LLM 音色匹配

**文件：**
- 创建：`src/lib/services/voice-matcher.ts`

- [ ] **步骤 1：实现 voice-matcher**

```typescript
// src/lib/services/voice-matcher.ts
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  timeout: 30000,
})

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

interface VoiceOption {
  id: string
  name: string
  gender: 'male' | 'female'
  style: string
}

export async function matchVoices(
  roles: string[],
  voices: VoiceOption[]
): Promise<Record<string, string>> {
  if (roles.length === 0) return {}

  // 单角色直接分配第一个音色
  if (roles.length === 1) return { [roles[0]]: voices[0].id }

  try {
    const voiceList = voices
      .map(v => `- id=${v.id}, name=${v.name}, gender=${v.gender === 'male' ? '男' : '女'}, style=${v.style}`)
      .join('\n')

    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `你是播客音色分配助手。根据角色名称和可用音色，为每个角色选择最合适的音色。
仅返回 JSON 对象，格式：{"角色名": "voice_id", ...}
不要输出任何其他内容。`,
        },
        {
          role: 'user',
          content: `角色列表：${roles.join('、')}\n\n可用音色：\n${voiceList}`,
        },
      ],
      max_tokens: 200,
      temperature: 0,
    })

    const content = res.choices[0]?.message?.content?.trim() || '{}'
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const mapping = JSON.parse(jsonMatch[0]) as Record<string, string>

    // 验证所有 voice_id 合法
    const validIds = new Set(voices.map(v => v.id))
    for (const role of roles) {
      if (!mapping[role] || !validIds.has(mapping[role])) {
        delete mapping[role]
      }
    }

    // 补全未匹配的角色（轮询兜底）
    let idx = 0
    for (const role of roles) {
      if (!mapping[role]) {
        mapping[role] = voices[idx % voices.length].id
        idx++
      }
    }

    return mapping
  } catch {
    // LLM 失败，轮询兜底
    const fallback: Record<string, string> = {}
    roles.forEach((role, i) => {
      fallback[role] = voices[i % voices.length].id
    })
    return fallback
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/lib/services/voice-matcher.ts
git commit -m "feat: add LLM-based voice matcher with fallback"
```

---

### 任务 3：AI 润色 API

**文件：**
- 创建：`src/app/api/script/polish/route.ts`

- [ ] **步骤 1：实现润色路由**

```typescript
// src/app/api/script/polish/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import type { ScriptSegment } from '@/types/database'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  timeout: 60000,
})

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const segments: ScriptSegment[] = body.segments

  if (!Array.isArray(segments) || segments.length === 0) {
    return NextResponse.json({ error: 'segments required' }, { status: 400 })
  }

  const scriptText = segments
    .map(s => `${s.role}：${s.text}`)
    .join('\n')

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `你是播客脚本润色助手。用户会给你一段播客对话脚本，请：
1. 让对话更口语化、自然
2. 补充适当的过渡语和语气词
3. 保持原意不变，不增删核心内容
4. 保持角色名不变

严格返回 JSON：{"segments":[{"role":"角色名","text":"润色后台词","emotion":"情绪","pause_ms":300}]}
不要输出其他内容。`,
      },
      { role: 'user', content: scriptText },
    ],
    max_tokens: 8192,
    temperature: 0.7,
  })

  const content = res.choices[0]?.message?.content?.trim() || ''
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'AI 润色失败，请重试' }, { status: 502 })
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    const polished: ScriptSegment[] = parsed.segments || []
    if (polished.length === 0) throw new Error('empty')
    return NextResponse.json({ segments: polished })
  } catch {
    return NextResponse.json({ error: 'AI 返回格式异常，请重试' }, { status: 502 })
  }
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/app/api/script/polish/route.ts
git commit -m "feat: add /api/script/polish for optional AI script polishing"
```

---

### 任务 4：类型扩展 + API 修改

**文件：**
- 修改：`src/types/database.ts`
- 修改：`src/app/api/episodes/route.ts`

- [ ] **步骤 1：扩展 CreateEpisodeInput 类型**

在 `src/types/database.ts` 的 `CreateEpisodeInput` 接口中新增：

```typescript
export interface CreateEpisodeInput {
  topic: string
  materials: Array<{ type: 'file' | 'url' | 'text'; url: string; text?: string }>
  params: {
    duration_min: number
    style: string
    roles_count: number
    voice_ids: string[]
    bgm: string
    skip_confirmation: boolean
  }
  project_id?: string
  title?: string
  estimated_cost?: number
  script?: ScriptSegment[]  // 新增：用户直传脚本
}
```

- [ ] **步骤 2：修改 POST /api/episodes 支持脚本模式**

在 `src/app/api/episodes/route.ts` 的 insert 逻辑前添加分支：

```typescript
// 脚本模式：用户直传 script，跳过 parsing + scripting
if (body.script && Array.isArray(body.script) && body.script.length > 0) {
  const { data, error } = await supabase
    .from('episodes')
    .insert({
      user_id: user.id,
      project_id: projectId,
      topic: body.topic || '用户脚本',
      script: JSON.stringify(body.script),
      status: 'script_ready',
      params: { ...body.params, source: 'user_script' },
      materials: [],
      title: body.title || body.topic || '用户脚本',
      estimated_cost: estimatedCost || null,
      preview_url: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 预扣费
  if (estimatedCost > 0) {
    await preCharge(user.id, estimatedCost, data.id)
  }

  // skip_confirmation 时直接触发 confirming → TTS
  if (body.params?.skip_confirmation) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    void fetch(`${baseUrl}/api/pipeline/advance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
      },
      body: JSON.stringify({
        episodeId: data.id,
        userId: user.id,
        step: 'confirming',
        attempt: 1,
      }),
    })
  }

  return NextResponse.json(data, { status: 201 })
}

// 以下为现有 AI 编剧模式（不变）...
```

- [ ] **步骤 3：验证 TypeScript 编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add src/types/database.ts src/app/api/episodes/route.ts
git commit -m "feat: support user script in POST /api/episodes (skip AI scripting)"
```

---

### 任务 5：脚本输入 UI 组件

**文件：**
- 创建：`src/components/create/script-input.tsx`

- [ ] **步骤 1：实现 ScriptInput 组件**

```tsx
// src/components/create/script-input.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { parseScript } from '@/lib/services/script-parser'
import type { ScriptSegment } from '@/types/database'

interface Props {
  segments: ScriptSegment[]
  onSegmentsChange: (segments: ScriptSegment[]) => void
  polishEnabled: boolean
  onPolishChange: (v: boolean) => void
}

export function ScriptInput({ segments, onSegmentsChange, polishEnabled, onPolishChange }: Props) {
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState(false)
  const [polishing, setPolishing] = useState(false)

  const handleParse = () => {
    const result = parseScript(rawText)
    onSegmentsChange(result)
    setParsed(result.length > 0)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    let text = ''
    if (file.name.endsWith('.txt')) {
      text = await file.text()
    } else if (file.name.endsWith('.docx')) {
      // docx 走服务端提取
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      text = data.text || ''
    } else {
      text = await file.text()
    }

    setRawText(text)
    const result = parseScript(text)
    onSegmentsChange(result)
    setParsed(result.length > 0)
  }

  const handlePolish = async () => {
    setPolishing(true)
    try {
      const res = await fetch('/api/script/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments }),
      })
      const data = await res.json()
      if (data.segments) onSegmentsChange(data.segments)
    } finally {
      setPolishing(false)
    }
  }

  const handleSegmentEdit = (index: number, text: string) => {
    const updated = [...segments]
    updated[index] = { ...updated[index], text }
    onSegmentsChange(updated)
  }

  const handleSegmentDelete = (index: number) => {
    onSegmentsChange(segments.filter((_, i) => i !== index))
  }

  const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>粘贴或输入脚本</Label>
        <Textarea
          placeholder={'支持两种格式：\n\n结构化对话：\n小林：大家好\n老陈：你好\n\n或纯文本（系统自动拆段）'}
          className="min-h-[200px] font-mono text-sm"
          value={rawText}
          onChange={(e) => { setRawText(e.target.value); setParsed(false) }}
        />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleParse} disabled={!rawText.trim()}>
          解析预览
        </Button>
        <label className="cursor-pointer">
          <input type="file" accept=".txt,.docx" className="hidden" onChange={handleFileUpload} />
          <Button variant="outline" size="sm" asChild>
            <span>上传文件</span>
          </Button>
        </label>
      </div>

      {parsed && segments.length > 0 && (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            共 {segments.length} 段 · 约 {totalChars} 字 · 角色：{[...new Set(segments.map(s => s.role))].join('、')}
          </p>
          <div className="max-h-[300px] space-y-2 overflow-y-auto">
            {segments.map((seg, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1 shrink-0 font-medium text-primary">{seg.role}：</span>
                <input
                  className="flex-1 rounded border px-2 py-1 text-sm"
                  value={seg.text}
                  onChange={(e) => handleSegmentEdit(i, e.target.value)}
                />
                <button
                  className="mt-1 text-muted-foreground hover:text-destructive"
                  onClick={() => handleSegmentDelete(i)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {parsed && segments.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={polishEnabled} onCheckedChange={onPolishChange} />
            <Label>AI 润色脚本</Label>
          </div>
          {polishEnabled && (
            <Button size="sm" variant="secondary" onClick={handlePolish} disabled={polishing}>
              {polishing ? '润色中...' : '执行润色'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **步骤 2：Commit**

```bash
git add src/components/create/script-input.tsx
git commit -m "feat: add ScriptInput component with parse preview and polish"
```

---

### 任务 6：创建向导集成

**文件：**
- 修改：`src/components/create/step-materials.tsx`
- 修改：`src/components/create/create-wizard.tsx`

- [ ] **步骤 1：step-materials 新增模式 Tab**

在 `step-materials.tsx` 顶部添加模式切换，脚本模式渲染 `<ScriptInput />`：

```tsx
// 新增 props
interface Props {
  topic: string
  onTopicChange: (v: string) => void
  materials: MaterialItem[]
  onMaterialsChange: (m: MaterialItem[]) => void
  // 新增
  mode: 'ai' | 'script'
  onModeChange: (m: 'ai' | 'script') => void
  segments: ScriptSegment[]
  onSegmentsChange: (s: ScriptSegment[]) => void
  polishEnabled: boolean
  onPolishChange: (v: boolean) => void
}
```

渲染逻辑：
```tsx
<div className="flex gap-2 mb-6">
  <Button variant={mode === 'ai' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('ai')}>
    🤖 AI 编剧
  </Button>
  <Button variant={mode === 'script' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('script')}>
    📝 我的脚本
  </Button>
</div>

{mode === 'ai' ? (
  // 现有 topic + materials 界面
) : (
  <ScriptInput ... />
)}
```

- [ ] **步骤 2：create-wizard 新增脚本模式状态**

在 `create-wizard.tsx` 中新增：

```tsx
const [mode, setMode] = useState<'ai' | 'script'>('ai')
const [segments, setSegments] = useState<ScriptSegment[]>([])
const [polishEnabled, setPolishEnabled] = useState(false)
```

修改 `canNext()`：
```tsx
if (step === 0) {
  if (mode === 'script') return segments.length > 0
  return topic.trim().length > 0
}
```

修改 `handleSubmit()`：
```tsx
body: JSON.stringify({
  topic: mode === 'script' ? (topic || '用户脚本') : topic,
  materials: mode === 'ai' ? materials.map(...) : [],
  script: mode === 'script' ? segments : undefined,
  params: { ...params, roles_count: mode === 'script' ? uniqueRoles.length : params.roles_count },
  ...
})
```

- [ ] **步骤 3：验证编译**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add src/components/create/step-materials.tsx src/components/create/create-wizard.tsx
git commit -m "feat: integrate script mode into create wizard"
```

---

### 任务 7：Step 2 音色匹配适配

**文件：**
- 修改：`src/components/create/step-params.tsx`

- [ ] **步骤 1：脚本模式下自动设置 roles_count + 调用音色匹配**

在 `step-params.tsx` 中：
- 新增 prop `scriptRoles: string[]`（从 segments 提取的去重角色名）
- 脚本模式下 `roles_count` 显示为只读（= scriptRoles.length）
- 进入 Step 2 时调用 `/api/voices` 获取音色库 + 调用 matchVoices 获取推荐
- 音色区显示：`角色名 → [推荐音色下拉框]`

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`

- [ ] **步骤 3：Commit**

```bash
git add src/components/create/step-params.tsx
git commit -m "feat: auto voice matching for script mode in step-params"
```

---

### 任务 8：费用预估适配

**文件：**
- 修改：`src/app/api/billing/estimate/route.ts`

- [ ] **步骤 1：支持脚本模式精确计费**

新增请求字段 `script_char_count?: number`，当提供时：
- `llm_cost = 0`（或 polish 时 0.01）
- `tts_cost = script_char_count / 1000 * 0.015`
- `mixing_cost = 0.01`

- [ ] **步骤 2：Commit**

```bash
git add src/app/api/billing/estimate/route.ts
git commit -m "feat: precise cost estimate for user script mode"
```

---

### 任务 9：端到端验证

- [ ] **步骤 1：启动 dev server，打开 /create**

- [ ] **步骤 2：切换到「我的脚本」模式，粘贴结构化对话，解析预览**

- [ ] **步骤 3：进入 Step 2 确认音色自动匹配**

- [ ] **步骤 4：提交，确认 episode 状态为 script_ready**

- [ ] **步骤 5：确认脚本 → TTS → 混音 → 完成**

- [ ] **步骤 6：最终 Commit + Push**

```bash
git add -A
git commit -m "feat: user script podcast generation - complete"
git push origin main
```
