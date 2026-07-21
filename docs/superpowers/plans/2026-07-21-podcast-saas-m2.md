# M2：创建流程（素材上传 + 参数设置 + 费用预估）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现完整的「创建新一期播客」三步向导——素材上传/解析、参数设置（时长/风格/角色/BGM）、费用预估确认并提交创建。

**架构：** 前端三步向导组件 → Upload API（Supabase Storage）→ 素材解析服务（纯文本提取）→ 费用预估 API → Episodes POST 创建任务。

**技术栈：** Next.js 15, shadcn/ui, Supabase Storage, pdf-parse, cheerio, mammoth, Upstash Redis

**前置依赖：** M1 已完成（项目骨架 + Auth + DB Schema + API 骨架）

---

## 文件结构

```
├── src/
│   ├── app/
│   │   ├── (app)/create/page.tsx              # 创建页（三步向导容器）
│   │   └── api/
│   │       ├── upload/route.ts                # 素材文件上传
│   │       └── billing/estimate/route.ts      # 费用预估
│   ├── components/
│   │   ├── create/
│   │   │   ├── create-wizard.tsx              # 向导主容器（步骤状态管理）
│   │   │   ├── step-materials.tsx             # Step 1: 素材输入
│   │   │   ├── step-params.tsx                # Step 2: 参数设置
│   │   │   ├── step-confirm.tsx               # Step 3: 确认提交
│   │   │   ├── material-uploader.tsx          # 文件上传组件（拖拽+链接+文本）
│   │   │   ├── voice-picker.tsx               # 角色音色选择卡片
│   │   │   └── cost-estimator.tsx             # 费用预估展示
│   │   └── ui/                                # shadcn 组件（已有）
│   ├── lib/
│   │   ├── services/
│   │   │   ├── parser.ts                      # 素材解析（PDF/URL/Word → 纯文本）
│   │   │   └── cost.ts                        # 费用估算引擎
│   │   └── supabase/
│   │       └── storage.ts                     # Storage 操作封装
│   └── types/
│       └── database.ts                        # 已有，追加 CreateEpisodeInput 类型
├── supabase/
│   └── storage-setup.sql                      # Storage bucket 创建
```

---

### 任务 1：Storage Bucket + 上传 API

**文件：**
- 创建：`supabase/storage-setup.sql`, `src/lib/supabase/storage.ts`, `src/app/api/upload/route.ts`

- [ ] **步骤 1：创建 Storage bucket SQL `supabase/storage-setup.sql`**

```sql
-- 素材文件 bucket
insert into storage.buckets (id, name, public) values ('materials', 'materials', false);

-- 音频产出 bucket
insert into storage.buckets (id, name, public) values ('audio', 'audio', true);

-- RLS: 用户只能访问自己的素材
create policy "Users can upload own materials" on storage.objects
  for insert with check (
    bucket_id = 'materials' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own materials" on storage.objects
  for select using (
    bucket_id = 'materials' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own materials" on storage.objects
  for delete using (
    bucket_id = 'materials' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 音频 bucket: 所有人可读（公开播放），仅系统可写
create policy "Audio is publicly readable" on storage.objects
  for select using (bucket_id = 'audio');

create policy "Service can write audio" on storage.objects
  for insert with check (bucket_id = 'audio');
```

在 Supabase Dashboard → SQL Editor 执行此 SQL。

- [ ] **步骤 2：创建 Storage 封装 `src/lib/supabase/storage.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'

export async function uploadMaterial(
  userId: string,
  file: File
): Promise<{ path: string; size: number }> {
  const supabase = await createClient()

  const ext = file.name.split('.').pop() || 'txt'
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage
    .from('materials')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  // 私有 bucket 不返回 publicUrl，后续 pipeline 用 service role 读取
  return { path: fileName, size: file.size }
}

export async function getSignedUrl(path: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('materials')
    .createSignedUrl(path, 3600)

  if (error) throw new Error(`Signed URL failed: ${error.message}`)
  return data.signedUrl
}
```

- [ ] **步骤 3：创建上传 API `src/app/api/upload/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadMaterial } from '@/lib/supabase/storage'

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Allowed: PDF, Word, TXT' },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Max 10MB' },
      { status: 400 }
    )
  }

  try {
    const { path, size } = await uploadMaterial(user.id, file)
    return NextResponse.json({ path, name: file.name, size })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}
```

- [ ] **步骤 4：Commit**

```bash
git add -A
git commit -m "feat: add storage buckets and file upload API"
```

---

### 任务 2：素材解析服务

**文件：**
- 创建：`src/lib/services/parser.ts`
- 安装依赖：`pdf-parse`, `cheerio`, `mammoth`

- [ ] **步骤 1：安装解析依赖**

```bash
npm install pdf-parse cheerio mammoth
npm install -D @types/pdf-parse
```

- [ ] **步骤 2：创建解析服务 `src/lib/services/parser.ts`**

```typescript
import pdfParse from 'pdf-parse'
import * as cheerio from 'cheerio'
import mammoth from 'mammoth'

export type MaterialType = 'pdf' | 'word' | 'text' | 'url'

export interface ParsedMaterial {
  type: MaterialType
  source: string       // 文件名或 URL
  text: string         // 提取的纯文本
  charCount: number
}

/**
 * 解析 PDF 文件为纯文本
 */
export async function parsePdf(buffer: Buffer, source: string): Promise<ParsedMaterial> {
  const data = await pdfParse(buffer)
  const text = data.text.trim()
  return { type: 'pdf', source, text, charCount: text.length }
}

/**
 * 解析 Word 文档为纯文本
 */
export async function parseWord(buffer: Buffer, source: string): Promise<ParsedMaterial> {
  const result = await mammoth.extractRawText({ buffer })
  const text = result.value.trim()
  return { type: 'word', source, text, charCount: text.length }
}

/**
 * 抓取网页内容并提取纯文本
 */
export async function parseUrl(url: string): Promise<ParsedMaterial> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PodCastAI/1.0' },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // 移除脚本、样式、导航等非内容元素
    $('script, style, nav, header, footer, aside, iframe, noscript').remove()

    // 提取正文文本
    const text = $('body').text()
      .replace(/\s+/g, ' ')   // 合并空白
      .trim()

    return { type: 'url', source: url, text, charCount: text.length }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 纯文本直接包装
 */
export function parseText(text: string, source: string): ParsedMaterial {
  const trimmed = text.trim()
  return { type: 'text', source, text: trimmed, charCount: trimmed.length }
}

/**
 * 根据文件类型路由到对应解析器
 */
export async function parseMaterial(
  file: { buffer: Buffer; name: string; type: string } | { url: string } | { text: string }
): Promise<ParsedMaterial> {
  if ('url' in file) {
    return parseUrl(file.url)
  }

  if ('text' in file) {
    return parseText(file.text, 'direct-input')
  }

  const { buffer, name, type } = file

  if (type === 'application/pdf') {
    return parsePdf(buffer, name)
  }

  if (
    type === 'application/msword' ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return parseWord(buffer, name)
  }

  if (type === 'text/plain') {
    return parseText(buffer.toString('utf-8'), name)
  }

  throw new Error(`Unsupported file type: ${type}`)
}
```

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "feat: add material parser service (PDF/Word/URL/text)"
```

---

### 任务 3：费用估算服务 + API

**文件：**
- 创建：`src/lib/services/cost.ts`, `src/app/api/billing/estimate/route.ts`

- [ ] **步骤 1：创建费用估算引擎 `src/lib/services/cost.ts`**

```typescript
// 单价配置（美元）
const PRICING = {
  llm_per_1k_tokens: 0.002,    // DeepSeek V4 Pro
  tts_per_1k_chars: 0.015,     // 阿里云/MiMo TTS
  mixing_per_episode: 0.01,    // 混音固定费
  storage_per_gb_month: 0.02,  // 存储月费
}

// 估算参数
const AVG_CHARS_PER_MINUTE = 250    // 中文播客每分钟约 250 字
const AVG_TOKENS_PER_CHAR = 1.5     // LLM 输入输出 token 比脚本字符数
const SCRIPT_OVERHEAD_RATIO = 1.3   // 编剧 prompt 开销系数

export interface CostEstimateInput {
  duration_min: number
  roles_count: number
  material_char_count: number
}

export interface CostEstimate {
  llm_cost: number
  tts_cost: number
  mixing_cost: number
  total: number
  breakdown: {
    estimated_script_chars: number
    estimated_llm_tokens: number
    estimated_tts_chars: number
  }
}

export function estimateCost(input: CostEstimateInput): CostEstimate {
  const { duration_min, roles_count, material_char_count } = input

  // 估算脚本总字数 = 时长 × 每分钟字数
  const estimatedScriptChars = duration_min * AVG_CHARS_PER_MINUTE

  // LLM token 估算 = 脚本字数 × token 比率 × 开销系数 + 素材输入 token
  const estimatedLlmTokens =
    estimatedScriptChars * AVG_TOKENS_PER_CHAR * SCRIPT_OVERHEAD_RATIO +
    material_char_count * AVG_TOKENS_PER_CHAR

  // TTS 字符数 = 脚本总字数（每个角色加起来就是总脚本）
  const estimatedTtsChars = estimatedScriptChars

  const llmCost = (estimatedLlmTokens / 1000) * PRICING.llm_per_1k_tokens
  const ttsCost = (estimatedTtsChars / 1000) * PRICING.tts_per_1k_chars
  const mixingCost = PRICING.mixing_per_episode

  const total = llmCost + ttsCost + mixingCost

  return {
    llm_cost: Math.round(llmCost * 10000) / 10000,
    tts_cost: Math.round(ttsCost * 10000) / 10000,
    mixing_cost: mixingCost,
    total: Math.round(total * 10000) / 10000,
    breakdown: {
      estimated_script_chars: estimatedScriptChars,
      estimated_llm_tokens: Math.round(estimatedLlmTokens),
      estimated_tts_chars: estimatedTtsChars,
    },
  }
}
```

- [ ] **步骤 2：创建费用预估 API `src/app/api/billing/estimate/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { estimateCost, type CostEstimateInput } from '@/lib/services/cost'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: CostEstimateInput = await request.json()

  if (!body.duration_min || body.duration_min < 1 || body.duration_min > 60) {
    return NextResponse.json(
      { error: 'duration_min must be between 1 and 60' },
      { status: 400 }
    )
  }

  const estimate = estimateCost(body)

  // 查询用户余额
  const { data: profile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    ...estimate,
    balance: profile?.balance ?? 0,
    sufficient: (profile?.balance ?? 0) >= estimate.total,
  })
}
```

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "feat: add cost estimation service and API"
```

---

### 任务 4：创建向导 — Step 1 素材输入

**文件：**
- 创建：`src/components/create/material-uploader.tsx`, `src/components/create/step-materials.tsx`

- [ ] **步骤 1：创建素材上传组件 `src/components/create/material-uploader.tsx`**

```typescript
'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface MaterialItem {
  type: 'file' | 'url' | 'text'
  name: string
  path?: string      // Storage path (file)
  url?: string       // 原始 URL
  text?: string      // 直接文本
  size?: number
  status: 'uploading' | 'ready' | 'error'
}

interface Props {
  materials: MaterialItem[]
  onChange: (materials: MaterialItem[]) => void
}

export function MaterialUploader({ materials, onChange }: Props) {
  const [urlInput, setUrlInput] = useState('')
  const [textInput, setTextInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const materialsRef = useRef(materials)
  materialsRef.current = materials

  const handleFileUpload = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      const item: MaterialItem = {
        type: 'file',
        name: file.name,
        size: file.size,
        status: 'uploading',
      }
      onChange([...materialsRef.current, item])

      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()

        if (!res.ok) throw new Error(data.error)

        onChange(materialsRef.current.map(m =>
          m.name === file.name && m.status === 'uploading'
            ? { ...m, path: data.path, status: 'ready' as const }
            : m
        ))
      } catch {
        onChange(materialsRef.current.map(m =>
          m.name === file.name && m.status === 'uploading'
            ? { ...m, status: 'error' as const }
            : m
        ))
      }
    }
  }, [onChange])

  const handleAddUrl = () => {
    if (!urlInput.trim()) return
    const item: MaterialItem = {
      type: 'url',
      name: urlInput.trim(),
      url: urlInput.trim(),
      status: 'ready',
    }
    onChange([...materials, item])
    setUrlInput('')
  }

  const handleAddText = () => {
    if (!textInput.trim()) return
    const item: MaterialItem = {
      type: 'text',
      name: `文本输入 (${textInput.length} 字)`,
      text: textInput.trim(),
      status: 'ready',
    }
    onChange([...materials, item])
    setTextInput('')
  }

  const handleRemove = (index: number) => {
    onChange(materials.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="file">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="file">📎 上传文件</TabsTrigger>
          <TabsTrigger value="url">🔗 网页链接</TabsTrigger>
          <TabsTrigger value="text">✏️ 输入文本</TabsTrigger>
        </TabsList>

        <TabsContent value="file" className="pt-4">
          <div
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? 'border-primary bg-muted/50' : 'border-muted-foreground/25'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files) }}
          >
            <p className="text-muted-foreground mb-4">拖拽文件到此处，或</p>
            <label>
              <input
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              />
              <Button variant="outline" asChild>
                <span>选择文件</span>
              </Button>
            </label>
            <p className="text-xs text-muted-foreground mt-2">支持 PDF、Word、TXT，最大 10MB</p>
          </div>
        </TabsContent>

        <TabsContent value="url" className="pt-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/article"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            />
            <Button onClick={handleAddUrl} disabled={!urlInput.trim()}>添加</Button>
          </div>
        </TabsContent>

        <TabsContent value="text" className="pt-4">
          <Textarea
            placeholder="粘贴或输入文本内容..."
            rows={6}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
          />
          <Button className="mt-2" onClick={handleAddText} disabled={!textInput.trim()}>
            添加文本
          </Button>
        </TabsContent>
      </Tabs>

      {/* 已添加素材列表 */}
      {materials.length > 0 && (
        <div className="space-y-2">
          {materials.map((item, i) => (
            <Card key={i}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2">
                  <span>{item.type === 'file' ? '📄' : item.type === 'url' ? '🔗' : '📝'}</span>
                  <span className="text-sm">{item.name}</span>
                  {item.status === 'uploading' && <span className="text-xs text-muted-foreground">上传中...</span>}
                  {item.status === 'error' && <span className="text-xs text-destructive">上传失败</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRemove(i)}>✕</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **步骤 2：创建 Step 1 组件 `src/components/create/step-materials.tsx`**

```typescript
'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MaterialUploader, type MaterialItem } from './material-uploader'

interface Props {
  topic: string
  onTopicChange: (topic: string) => void
  materials: MaterialItem[]
  onMaterialsChange: (materials: MaterialItem[]) => void
}

export function StepMaterials({ topic, onTopicChange, materials, onMaterialsChange }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="topic" className="text-base">话题方向 *</Label>
        <Input
          id="topic"
          placeholder="例如：AI Agent 的未来发展趋势"
          value={topic}
          onChange={(e) => onTopicChange(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          告诉 AI 这期播客要聊什么方向
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-base">参考素材（可选）</Label>
        <MaterialUploader materials={materials} onChange={onMaterialsChange} />
        <p className="text-sm text-muted-foreground">
          提供文章、链接或文本作为播客内容参考
        </p>
      </div>
    </div>
  )
}
```

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "feat: add material uploader and step 1 components"
```

---

### 任务 5：创建向导 — Step 2 参数设置

**文件：**
- 创建：`src/components/create/voice-picker.tsx`, `src/components/create/step-params.tsx`

- [ ] **步骤 1：创建音色选择组件 `src/components/create/voice-picker.tsx`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Voice } from '@/types/database'

interface Props {
  selected: string[]    // 选中的 voice id 列表
  onChange: (ids: string[]) => void
  maxCount: number
}

export function VoicePicker({ selected, onChange, maxCount }: Props) {
  const [voices, setVoices] = useState<Voice[]>([])

  useEffect(() => {
    fetch('/api/voices')
      .then(res => res.json())
      .then(setVoices)
      .catch(console.error)
  }, [])

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(v => v !== id))
    } else if (selected.length < maxCount) {
      onChange([...selected, id])
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {voices.map((voice) => {
        const isSelected = selected.includes(voice.id)
        const isDisabled = !isSelected && selected.length >= maxCount

        return (
          <Card
            key={voice.id}
            className={cn(
              'cursor-pointer transition-all',
              isSelected && 'border-primary ring-1 ring-primary',
              isDisabled && 'opacity-50 cursor-not-allowed'
            )}
            onClick={() => !isDisabled && toggle(voice.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {voice.gender === 'female' ? '👩' : '👨'} {voice.name}
                </span>
                {isSelected && <Badge variant="default">已选</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{voice.style}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {voice.provider === 'aliyun' ? '阿里云' : 'MiMo'}
              </p>
              {voice.sample_url && (
                <audio
                  src={voice.sample_url}
                  controls
                  className="mt-2 h-8 w-full"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
```

- [ ] **步骤 2：创建 Step 2 组件 `src/components/create/step-params.tsx`**

```typescript
'use client'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { VoicePicker } from './voice-picker'

export interface EpisodeParams {
  duration_min: number
  style: string
  roles_count: number
  voice_ids: string[]
  bgm: string
  skip_confirmation: boolean
}

interface Props {
  params: EpisodeParams
  onChange: (params: EpisodeParams) => void
}

const STYLES = [
  { value: 'casual', label: '轻松闲聊' },
  { value: 'deep', label: '深度对谈' },
  { value: 'news', label: '新闻播报' },
  { value: 'story', label: '故事叙述' },
]

const BGM_OPTIONS = [
  { value: 'none', label: '无背景音乐' },
  { value: 'light', label: '轻快' },
  { value: 'calm', label: '舒缓' },
  { value: 'tech', label: '科技感' },
]

export function StepParams({ params, onChange }: Props) {
  const update = (partial: Partial<EpisodeParams>) => {
    const next = { ...params, ...partial }
    // 角色数减少时裁剪已选音色
    if (partial.roles_count && next.voice_ids.length > partial.roles_count) {
      next.voice_ids = next.voice_ids.slice(0, partial.roles_count)
    }
    onChange(next)
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>目标时长</Label>
          <Select
            value={String(params.duration_min)}
            onValueChange={(v) => update({ duration_min: Number(v) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 分钟</SelectItem>
              <SelectItem value="10">10 分钟</SelectItem>
              <SelectItem value="20">20 分钟</SelectItem>
              <SelectItem value="30">30 分钟</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>对话风格</Label>
          <Select value={params.style} onValueChange={(v) => update({ style: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>角色数量</Label>
          <Select
            value={String(params.roles_count)}
            onValueChange={(v) => update({ roles_count: Number(v) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 人对话</SelectItem>
              <SelectItem value="3">3 人讨论</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>背景音乐</Label>
          <Select value={params.bgm} onValueChange={(v) => update({ bgm: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BGM_OPTIONS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>选择角色音色（{params.voice_ids.length}/{params.roles_count}）</Label>
        <VoicePicker
          selected={params.voice_ids}
          onChange={(ids) => update({ voice_ids: ids })}
          maxCount={params.roles_count}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <Label>跳过脚本确认</Label>
          <p className="text-sm text-muted-foreground">生成后直接合成，不等待你确认脚本</p>
        </div>
        <Switch
          checked={params.skip_confirmation}
          onCheckedChange={(v) => update({ skip_confirmation: v })}
        />
      </div>
    </div>
  )
}
```

- [ ] **步骤 3：安装 Switch 组件（如未有）**

```bash
npx shadcn@latest add switch select
```

- [ ] **步骤 4：Commit**

```bash
git add -A
git commit -m "feat: add voice picker and step 2 params components"
```

---

### 任务 6：创建向导 — Step 3 确认 + 向导容器

**文件：**
- 创建：`src/components/create/cost-estimator.tsx`, `src/components/create/step-confirm.tsx`, `src/components/create/create-wizard.tsx`
- 修改：`src/app/(app)/create/page.tsx`

- [ ] **步骤 1：创建费用展示组件 `src/components/create/cost-estimator.tsx`**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Props {
  estimate: {
    llm_cost: number
    tts_cost: number
    mixing_cost: number
    total: number
    breakdown: {
      estimated_script_chars: number
      estimated_llm_tokens: number
      estimated_tts_chars: number
    }
  } | null
  balance: number
  loading: boolean
}

export function CostEstimator({ estimate, balance, loading }: Props) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">正在估算费用...</p>
  }

  if (!estimate) return null

  const sufficient = balance >= estimate.total

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">费用预估</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">AI 编剧 (LLM)</span>
            <span>${estimate.llm_cost.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">语音合成 (TTS)</span>
            <span>${estimate.tts_cost.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">混音处理</span>
            <span>${estimate.mixing_cost.toFixed(4)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-medium">
            <span>合计</span>
            <span>${estimate.total.toFixed(4)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            账户余额：${balance.toFixed(2)}
          </span>
          <Badge variant={sufficient ? 'default' : 'destructive'}>
            {sufficient ? '余额充足' : '余额不足'}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          预估脚本约 {estimate.breakdown.estimated_script_chars} 字 ·
          最终按实际用量结算，多退少补
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **步骤 2：创建 Step 3 确认组件 `src/components/create/step-confirm.tsx`**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CostEstimator } from './cost-estimator'
import type { MaterialItem } from './material-uploader'
import type { EpisodeParams } from './step-params'

interface Props {
  topic: string
  materials: MaterialItem[]
  params: EpisodeParams
  estimate: {
    llm_cost: number
    tts_cost: number
    mixing_cost: number
    total: number
    breakdown: { estimated_script_chars: number; estimated_llm_tokens: number; estimated_tts_chars: number }
  } | null
  balance: number
  estimateLoading: boolean
}

const STYLE_LABELS: Record<string, string> = {
  casual: '轻松闲聊', deep: '深度对谈', news: '新闻播报', story: '故事叙述',
}

export function StepConfirm({ topic, materials, params, estimate, balance, estimateLoading }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">节目概要</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">话题</span>
            <span>{topic}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">素材</span>
            <span>{materials.length} 份（共 {materials.reduce((sum, m) => sum + (m.text?.length || 0), 0)} 字）</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">时长</span>
            <span>{params.duration_min} 分钟</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">风格</span>
            <span>{STYLE_LABELS[params.style] || params.style}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">角色</span>
            <span>{params.roles_count} 人</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">脚本确认</span>
            <span>{params.skip_confirmation ? '跳过（直接生成）' : '需要确认'}</span>
          </div>
        </CardContent>
      </Card>

      <CostEstimator estimate={estimate} balance={balance} loading={estimateLoading} />
    </div>
  )
}
```

- [ ] **步骤 3：创建向导容器 `src/components/create/create-wizard.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StepMaterials } from './step-materials'
import { StepParams, type EpisodeParams } from './step-params'
import { StepConfirm } from './step-confirm'
import type { MaterialItem } from './material-uploader'

const STEPS = ['输入素材', '设置参数', '确认生成']

export function CreateWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // Step 1 数据
  const [topic, setTopic] = useState('')
  const [materials, setMaterials] = useState<MaterialItem[]>([])

  // Step 2 数据
  const [params, setParams] = useState<EpisodeParams>({
    duration_min: 10,
    style: 'casual',
    roles_count: 2,
    voice_ids: [],
    bgm: 'light',
    skip_confirmation: false,
  })

  // Step 3 数据
  const [estimate, setEstimate] = useState<any>(null)
  const [balance, setBalance] = useState(0)
  const [estimateLoading, setEstimateLoading] = useState(false)

  // 进入 Step 3 时获取费用预估
  useEffect(() => {
    if (step !== 2) return
    setEstimateLoading(true)

    // 文件类素材用 size/3 粗估字符数（中文 UTF-8 约 3 字节/字）
    const materialChars = materials.reduce((sum, m) => {
      if (m.text) return sum + m.text.length
      if (m.size) return sum + Math.round(m.size / 3)
      return sum
    }, 0)

    fetch('/api/billing/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duration_min: params.duration_min,
        roles_count: params.roles_count,
        material_char_count: materialChars,
      }),
    })
      .then(res => res.json())
      .then(data => {
        setEstimate(data)
        setBalance(data.balance)
      })
      .catch(console.error)
      .finally(() => setEstimateLoading(false))
  }, [step, params.duration_min, params.roles_count, materials])

  const canNext = () => {
    if (step === 0) return topic.trim().length > 0
    if (step === 1) return params.voice_ids.length === params.roles_count
    return true
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          materials: materials.map(m => ({
            type: m.type,
            url: m.url || m.path || '',
            text: m.text,
          })),
          params: {
            duration_min: params.duration_min,
            style: params.style,
            roles_count: params.roles_count,
            voice_ids: params.voice_ids,
            bgm: params.bgm,
            skip_confirmation: params.skip_confirmation,
          },
          estimated_cost: estimate?.total || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      router.push(`/episodes/${data.id}`)
      router.refresh()
    } catch (err) {
      alert((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* 步骤指示器 */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
              i === step && 'bg-primary text-primary-foreground',
              i < step && 'bg-primary/20 text-primary',
              i > step && 'bg-muted text-muted-foreground'
            )}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={cn('text-sm', i === step && 'font-medium')}>{label}</span>
            {i < STEPS.length - 1 && <div className="mx-2 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {/* 步骤内容 */}
      {step === 0 && (
        <StepMaterials
          topic={topic}
          onTopicChange={setTopic}
          materials={materials}
          onMaterialsChange={setMaterials}
        />
      )}
      {step === 1 && (
        <StepParams params={params} onChange={setParams} />
      )}
      {step === 2 && (
        <StepConfirm
          topic={topic}
          materials={materials}
          params={params}
          estimate={estimate}
          balance={balance}
          estimateLoading={estimateLoading}
        />
      )}

      {/* 导航按钮 */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
          上一步
        </Button>
        {step < 2 ? (
          <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
            下一步
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting || !estimate || balance < (estimate?.total || 0)}
          >
            {submitting ? '创建中...' : `确认生成（$${estimate?.total?.toFixed(4) || '...'}）`}
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **步骤 4：更新创建页 `src/app/(app)/create/page.tsx`**

```typescript
import { CreateWizard } from '@/components/create/create-wizard'

export default function CreatePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">创建新节目</h1>
      <CreateWizard />
    </div>
  )
}
```

- [ ] **步骤 5：Commit**

```bash
git add -A
git commit -m "feat: add create wizard with 3-step flow (materials, params, confirm)"
```

---

### 任务 7：类型补充 + 集成验证

**文件：**
- 修改：`src/types/database.ts`

- [ ] **步骤 1：在 `src/types/database.ts` 末尾追加创建输入类型**

```typescript
// === 创建剧集输入 ===
export interface CreateEpisodeInput {
  topic: string
  materials: Array<{
    type: 'file' | 'url' | 'text'
    url: string
    text?: string
  }>
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
}
```

- [ ] **步骤 2：运行 TypeScript 检查**

```bash
npx tsc --noEmit
```
预期：无错误。如有类型不匹配，修复后重新检查。

- [ ] **步骤 3：运行开发服务器验证完整流程**

```bash
npm run dev
```

验证清单：
1. 访问 /create，三步向导渲染正常
2. Step 1：输入话题，上传文件（或粘贴链接/文本），点下一步
3. Step 2：选择时长/风格/角色数/音色/BGM，点下一步
4. Step 3：显示费用预估和余额，确认按钮可点击
5. 点击确认 → 调用 POST /api/episodes → 跳转到 /episodes/[id]

- [ ] **步骤 4：Commit**

```bash
git add -A
git commit -m "feat: add CreateEpisodeInput type and verify integration"
```

---

## M2 完成标准

- [ ] 文件上传到 Supabase Storage 成功（PDF/Word/TXT）
- [ ] 网页链接可添加为素材
- [ ] 纯文本可直接输入
- [ ] 参数设置完整（时长/风格/角色数/音色/BGM/跳过确认）
- [ ] 音色选择卡片从 /api/voices 加载，支持试听
- [ ] 费用预估 API 返回正确估算
- [ ] 余额不足时确认按钮禁用
- [ ] 提交后成功创建 episode 记录并跳转详情页
- [ ] TypeScript 无类型错误

---

## 后续里程碑

- M3：Pipeline 核心（编剧 + TTS + 混音 + 状态机）
- M4：剧集详情（播放器 + 脚本编辑 + 进度追踪）
- M5：计费（Stripe 充值 + 按量扣费 + 账单页）
- M6：打磨（落地页 + PostHog + Sentry + 部署）
