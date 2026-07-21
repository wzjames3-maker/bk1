# M3：Pipeline 核心（编剧 + TTS + 混音 + 状态机）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现完整的播客生产 Pipeline——从剧集创建触发到最终音频输出，包括状态机编排、AI 编剧、TTS 合成、FFmpeg 混音和后处理。

**架构：** Next.js API Route 作为 Pipeline 编排器（链式自调用），每步完成后触发下一步；外部服务（DeepSeek/阿里云TTS/MiMo）通过服务层封装调用；FFmpeg 在 API Route 中运行（`@ffmpeg-installer/ffmpeg`）；Upstash Redis 做并发控制和去重。

**技术栈：** Next.js 16, DeepSeek API, 阿里云 TTS, MiMo TTS, fluent-ffmpeg, @ffmpeg-installer/ffmpeg, @upstash/redis, Supabase (DB + Storage + Realtime)

**前置依赖：** M1（Auth + DB Schema）+ M2（创建流程 + 素材上传 + 费用预估）已完成

---

## 文件结构

```
├── src/
│   ├── app/api/
│   │   ├── pipeline/advance/route.ts        # Pipeline 推进入口（链式自调用）
│   │   └── episodes/[id]/
│   │       ├── retry/route.ts               # 从失败步骤重试
│   │       └── confirm/route.ts             # 用户确认脚本
│   ├── lib/
│   │   ├── services/
│   │   │   ├── deepseek.ts                  # DeepSeek 编剧服务
│   │   │   ├── tts-aliyun.ts                # 阿里云 TTS
│   │   │   ├── tts-mimo.ts                  # MiMo TTS
│   │   │   ├── tts-router.ts                # 按角色路由到 TTS 供应商
│   │   │   ├── ffmpeg.ts                    # FFmpeg 混音服务
│   │   │   └── post-process.ts              # Show notes + 时间戳生成
│   │   ├── pipeline/
│   │   │   ├── state-machine.ts             # 状态机定义 + 转换规则
│   │   │   ├── orchestrator.ts              # Pipeline 编排（执行当前步骤 + 触发下一步）
│   │   │   ├── steps/
│   │   │   │   ├── parse.ts                 # Step: 素材解析
│   │   │   │   ├── script.ts                # Step: AI 编剧 + 30s 预合成
│   │   │   │   ├── confirm.ts               # Step: 等待用户确认（或跳过）
│   │   │   │   ├── tts.ts                   # Step: TTS 逐段合成
│   │   │   │   ├── mix.ts                   # Step: FFmpeg 混音
│   │   │   │   └── post.ts                  # Step: 后处理
│   │   │   └── step-logger.ts              # 步骤日志记录
│   │   └── supabase/
│   │       └── admin.ts                     # Service Role 客户端（Pipeline 专用）
│   └── types/
│       └── pipeline.ts                      # Pipeline 相关类型
├── .env.local                               # 追加 DEEPSEEK/TTS/UPSTASH 环境变量
```

---

## 全局约束

- Pipeline 推进机制：链式自调用（每步完成后 POST /api/pipeline/advance），加最大步数守卫（MAX_STEPS = 10）
- 外部调用超时：60s，指数退避重试最多 3 次
- TTS 逐段合成：单段失败重试 3 次，不影响其他段
- 30s 试听样本：编剧完成后自动预合成前 3 段
- 状态机：pending → parsing → scripting → script_ready → confirming → tts_processing → mixing → post_processing → completed；任何步骤失败 → failed
- Pipeline 使用 Supabase Service Role 客户端（绕过 RLS）
- 并发控制：Upstash Redis，每用户最多 1 个并发 Pipeline

---

### 任务 1：环境准备 + 依赖安装 + 类型定义

**文件：**
- 修改：`.env.local`, `next.config.ts`, `package.json`
- 创建：`src/types/pipeline.ts`, `src/lib/supabase/admin.ts`

- [ ] **步骤 1：安装依赖**

```bash
npm install @upstash/redis fluent-ffmpeg @ffmpeg-installer/ffmpeg openai
npm install -D @types/fluent-ffmpeg
```

注：`openai` 包用于调用 DeepSeek API（兼容 OpenAI SDK 格式）。

- [ ] **步骤 2：追加环境变量到 `.env.local`**

```env
# DeepSeek (OpenAI 兼容)
DEEPSEEK_API_KEY=your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com

# 阿里云 TTS
ALIYUN_TTS_ACCESS_KEY=your-access-key
ALIYUN_TTS_SECRET_KEY=your-secret-key
ALIYUN_TTS_APP_KEY=your-app-key

# MiMo TTS
MIMO_API_KEY=your-mimo-key
MIMO_BASE_URL=https://api.mimo.audio

# Upstash Redis
UPSTASH_REDIS_URL=your-upstash-url
UPSTASH_REDIS_TOKEN=your-upstash-token

# Pipeline 内部调用鉴权
PIPELINE_INTERNAL_SECRET=a-random-secret-string-change-in-production
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **步骤 3：更新 `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'fluent-ffmpeg', '@ffmpeg-installer/ffmpeg'],
}

export default nextConfig
```

- [ ] **步骤 4：创建 Pipeline 类型 `src/types/pipeline.ts`**

```typescript
import type { EpisodeStatus, ScriptSegment } from './database'

export type PipelineStep =
  | 'parsing'
  | 'scripting'
  | 'confirming'
  | 'tts_processing'
  | 'mixing'
  | 'post_processing'

export const STEP_ORDER: PipelineStep[] = [
  'parsing',
  'scripting',
  'confirming',
  'tts_processing',
  'mixing',
  'post_processing',
]

export const STATUS_TO_STEP: Partial<Record<EpisodeStatus, PipelineStep>> = {
  parsing: 'parsing',
  scripting: 'scripting',
  script_ready: 'confirming',
  confirming: 'confirming',
  tts_processing: 'tts_processing',
  mixing: 'mixing',
  post_processing: 'post_processing',
}

export const STEP_TO_STATUS: Record<PipelineStep, EpisodeStatus> = {
  parsing: 'parsing',
  scripting: 'scripting',
  confirming: 'confirming',
  tts_processing: 'tts_processing',
  mixing: 'mixing',
  post_processing: 'post_processing',
}

export interface PipelineContext {
  episodeId: string
  userId: string
  currentStep: PipelineStep
  attempt: number
}

export interface TtsSegmentResult {
  index: number
  audioPath: string    // Storage path
  durationMs: number
  charCount: number
}

export interface MixResult {
  audioPath: string    // 最终音频 Storage path
  durationMs: number
}

export const MAX_STEPS = 10
export const MAX_RETRIES = 3
export const EXTERNAL_TIMEOUT_MS = 60000
```

- [ ] **步骤 5：创建 Service Role 客户端 `src/lib/supabase/admin.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **步骤 6：Commit**

```bash
git add -A
git commit -m "feat: add pipeline dependencies, types, and admin client"
```

---

### 任务 2：状态机 + 步骤日志 + 编排器

**文件：**
- 创建：`src/lib/pipeline/state-machine.ts`, `src/lib/pipeline/step-logger.ts`, `src/lib/pipeline/orchestrator.ts`

- [ ] **步骤 1：创建状态机 `src/lib/pipeline/state-machine.ts`**

```typescript
import type { EpisodeStatus } from '@/types/database'
import { STEP_ORDER, STEP_TO_STATUS, type PipelineStep } from '@/types/pipeline'

const VALID_TRANSITIONS: Record<EpisodeStatus, EpisodeStatus[]> = {
  pending: ['parsing', 'failed'],
  parsing: ['scripting', 'failed'],
  scripting: ['script_ready', 'failed'],
  script_ready: ['confirming', 'tts_processing', 'failed'],
  confirming: ['tts_processing', 'failed'],
  tts_processing: ['mixing', 'failed'],
  mixing: ['post_processing', 'failed'],
  post_processing: ['completed', 'failed'],
  completed: [],
  failed: ['parsing', 'scripting', 'confirming', 'tts_processing', 'mixing', 'post_processing'],
}

export function canTransition(from: EpisodeStatus, to: EpisodeStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function getNextStep(current: PipelineStep): PipelineStep | null {
  const idx = STEP_ORDER.indexOf(current)
  if (idx === -1 || idx >= STEP_ORDER.length - 1) return null
  return STEP_ORDER[idx + 1]
}

export function getStepStatus(step: PipelineStep): EpisodeStatus {
  return STEP_TO_STATUS[step]
}
```

- [ ] **步骤 2：创建步骤日志 `src/lib/pipeline/step-logger.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { PipelineStep } from '@/types/pipeline'

export async function logStepStart(episodeId: string, step: PipelineStep, attempt: number) {
  const supabase = createAdminClient()

  // 查找已有记录（重试场景）
  const { data: existing } = await supabase
    .from('episode_steps')
    .select('id')
    .eq('episode_id', episodeId)
    .eq('step', step)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('episode_steps')
      .update({ status: 'running', attempt, started_at: new Date().toISOString(), error_message: null })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('episode_steps')
      .insert({ episode_id: episodeId, step, status: 'running', attempt })
  }
}

export async function logStepDone(episodeId: string, step: PipelineStep) {
  const supabase = createAdminClient()
  await supabase
    .from('episode_steps')
    .update({ status: 'done', finished_at: new Date().toISOString() })
    .eq('episode_id', episodeId)
    .eq('step', step)
}

export async function logStepFailed(episodeId: string, step: PipelineStep, error: string) {
  const supabase = createAdminClient()
  await supabase
    .from('episode_steps')
    .update({ status: 'failed', finished_at: new Date().toISOString(), error_message: error })
    .eq('episode_id', episodeId)
    .eq('step', step)
}
```

- [ ] **步骤 3：创建编排器 `src/lib/pipeline/orchestrator.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { canTransition, getNextStep, getStepStatus } from './state-machine'
import { logStepStart, logStepDone, logStepFailed } from './step-logger'
import { MAX_STEPS, type PipelineStep } from '@/types/pipeline'
import type { EpisodeStatus } from '@/types/database'

// 步骤执行器注册表（在 steps/ 中实现）
type StepExecutor = (episodeId: string, userId: string) => Promise<void>
const stepExecutors: Partial<Record<PipelineStep, StepExecutor>> = {}

export function registerStep(step: PipelineStep, executor: StepExecutor) {
  stepExecutors[step] = executor
}

export async function advancePipeline(
  episodeId: string,
  userId: string,
  currentStep: PipelineStep,
  attempt: number = 1
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()

  // 最大步数守卫
  if (attempt > MAX_STEPS) {
    return { success: false, error: `Max steps exceeded (${MAX_STEPS})` }
  }

  const { data: episode } = await supabase
    .from('episodes')
    .select('status')
    .eq('id', episodeId)
    .single()

  if (!episode) return { success: false, error: 'Episode not found' }

  const targetStatus = getStepStatus(currentStep)

  // 状态转换校验
  if (!canTransition(episode.status as EpisodeStatus, targetStatus)) {
    return { success: false, error: `Invalid transition: ${episode.status} → ${targetStatus}` }
  }

  // 更新 episode 状态
  await supabase
    .from('episodes')
    .update({ status: targetStatus })
    .eq('id', episodeId)

  // 记录步骤开始
  await logStepStart(episodeId, currentStep, attempt)

  try {
    const executor = stepExecutors[currentStep]
    if (!executor) throw new Error(`No executor registered for step: ${currentStep}`)

    await executor(episodeId, userId)

    // 步骤完成
    await logStepDone(episodeId, currentStep)

    // 检查是否需要等待用户确认
    if (currentStep === 'scripting') {
      // 编剧完成 → 状态设为 script_ready，等用户确认或自动跳过
      await supabase.from('episodes').update({ status: 'script_ready' }).eq('id', episodeId)
      return { success: true }
    }

    // 触发下一步
    const nextStep = getNextStep(currentStep)
    if (nextStep) {
      // 链式自调用
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      await fetch(`${baseUrl}/api/pipeline/advance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
        },
        body: JSON.stringify({ episodeId, userId, step: nextStep, attempt: 1 }),
      })
    } else {
      // 所有步骤完成
      await supabase
        .from('episodes')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', episodeId)
    }

    return { success: true }
  } catch (err) {
    const errorMsg = (err as Error).message

    // 等待确认不是失败——状态回退到 script_ready
    if (errorMsg === 'WAITING_FOR_CONFIRMATION') {
      await logStepDone(episodeId, currentStep)
      await supabase.from('episodes').update({ status: 'script_ready' }).eq('id', episodeId)
      return { success: true }
    }

    await logStepFailed(episodeId, currentStep, errorMsg)
    await supabase
      .from('episodes')
      .update({ status: 'failed', failed_at_step: currentStep })
      .eq('id', episodeId)

    return { success: false, error: errorMsg }
  }
}
```

- [ ] **步骤 4：Commit**

```bash
git add -A
git commit -m "feat: add pipeline state machine, step logger, and orchestrator"
```

---

### 任务 3：DeepSeek 编剧服务

**文件：**
- 创建：`src/lib/services/deepseek.ts`, `src/lib/pipeline/steps/script.ts`

- [ ] **步骤 1：创建 DeepSeek 服务 `src/lib/services/deepseek.ts`**

```typescript
import OpenAI from 'openai'
import { EXTERNAL_TIMEOUT_MS, MAX_RETRIES } from '@/types/pipeline'
import type { ScriptSegment } from '@/types/database'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  timeout: EXTERNAL_TIMEOUT_MS,
})

interface ScriptGenInput {
  topic: string
  materials: string       // 合并后的素材纯文本
  durationMin: number
  style: string
  rolesCount: number
  voiceNames: string[]    // 角色名称列表
}

const SYSTEM_PROMPT = `你是一个专业的播客编剧。根据用户提供的素材和话题，生成一段自然、有深度的多人对话脚本。

输出格式要求：严格返回 JSON 数组，每个元素格式为：
{"role": "角色名", "text": "对话内容", "emotion": "情绪(中性/开心/惊讶/思考/兴奋)", "pause_ms": 停顿毫秒数(200-1000)}

规则：
1. 对话要口语化、自然，像真人聊天
2. 中文为主，专业术语可用英文（如 Transformer、Agent）
3. 角色之间要有互动、追问、回应
4. 根据目标时长控制总字数（每分钟约 250 字）
5. 开头有简短的节目开场白，结尾有总结收尾
6. pause_ms 用于控制节奏，重要转折前停顿长一些`

export async function generateScript(input: ScriptGenInput): Promise<{
  segments: ScriptSegment[]
  tokenUsage: { prompt: number; completion: number }
}> {
  const { topic, materials, durationMin, style, rolesCount, voiceNames } = input

  const targetChars = durationMin * 250
  const rolesDesc = voiceNames.slice(0, rolesCount).join('、')

  const userPrompt = `话题：${topic}
风格：${style}
角色：${rolesDesc}（共 ${rolesCount} 人）
目标时长：${durationMin} 分钟（约 ${targetChars} 字）

参考素材：
${materials.slice(0, 8000)}

请生成完整的对话脚本 JSON 数组。`

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' },
      })

      const content = response.choices[0]?.message?.content
      if (!content) throw new Error('Empty response from DeepSeek')

      // 解析 JSON（可能被包裹在 {"segments": [...]} 中）
      const parsed = JSON.parse(content)
      const segments: ScriptSegment[] = Array.isArray(parsed) ? parsed : parsed.segments || parsed.script || []

      if (segments.length === 0) throw new Error('Generated script is empty')

      return {
        segments,
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
```

- [ ] **步骤 2：创建编剧步骤 `src/lib/pipeline/steps/script.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { generateScript } from '@/lib/services/deepseek'
import { parseMaterial } from '@/lib/services/parser'
import type { ScriptSegment } from '@/types/database'

export async function executeScriptStep(episodeId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('*')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const params = episode.params as { duration_min: number; style: string; roles_count: number; voice_ids: string[] }
  const materials = episode.materials as Array<{ type: string; url: string; text?: string }>

  // 合并素材文本
  let combinedText = ''
  for (const mat of materials) {
    if (mat.text) {
      combinedText += mat.text + '\n\n'
    } else if (mat.url && mat.type === 'url') {
      const parsed = await parseMaterial({ url: mat.url })
      combinedText += parsed.text + '\n\n'
    }
    // file 类型的 extracted_text 在 parsing 步骤已处理
  }

  // 获取角色名称
  const { data: voices } = await supabase
    .from('voices')
    .select('name')
    .in('id', params.voice_ids || [])

  const voiceNames = voices?.map(v => v.name) || ['小雅', '老陈']

  // 调用 DeepSeek 生成脚本
  const { segments, tokenUsage } = await generateScript({
    topic: episode.topic,
    materials: combinedText,
    durationMin: params.duration_min,
    style: params.style,
    rolesCount: params.roles_count,
    voiceNames,
  })

  // 保存脚本到 episode
  await supabase
    .from('episodes')
    .update({ script: JSON.stringify(segments) })
    .eq('id', episodeId)

  // 记录 LLM 用量
  const totalTokens = tokenUsage.prompt + tokenUsage.completion
  const llmCost = (totalTokens / 1000) * 0.002
  await supabase.from('usage_logs').insert({
    user_id: userId,
    episode_id: episodeId,
    type: 'llm_token',
    quantity: totalTokens,
    cost: llmCost,
  })

  // 预合成 30s 试听样本（前 3 段）
  const previewSegments = segments.slice(0, 3)
  if (previewSegments.length > 0) {
    // 试听样本在 TTS 步骤中一并处理，这里标记需要生成
    await supabase
      .from('episodes')
      .update({ preview_url: 'pending' })
      .eq('id', episodeId)
  }
}
```

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "feat: add DeepSeek scripting service and pipeline step"
```

---

### 任务 4：TTS 服务（阿里云 + MiMo + 路由）

**文件：**
- 创建：`src/lib/services/tts-aliyun.ts`, `src/lib/services/tts-mimo.ts`, `src/lib/services/tts-router.ts`, `src/lib/pipeline/steps/tts.ts`

- [ ] **步骤 1：创建阿里云 TTS `src/lib/services/tts-aliyun.ts`**

```typescript
import { EXTERNAL_TIMEOUT_MS, MAX_RETRIES } from '@/types/pipeline'

interface TtsOptions {
  text: string
  voiceId: string
  speed?: number     // 0.5 - 2.0
  pitch?: number     // 0.5 - 2.0
}

interface TtsResult {
  audioBuffer: Buffer
  durationMs: number
}

export async function synthesizeAliyun(options: TtsOptions): Promise<TtsResult> {
  const { text, voiceId, speed = 1.0, pitch = 1.0 } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS)

      const response = await fetch('https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NLS-Token': process.env.ALIYUN_TTS_ACCESS_KEY!,
        },
        body: JSON.stringify({
          appkey: process.env.ALIYUN_TTS_APP_KEY!,
          text,
          voice: voiceId,
          format: 'mp3',
          speech_rate: Math.round((speed - 1) * 500),   // -500 ~ 500
          pitch_rate: Math.round((pitch - 1) * 500),
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`Aliyun TTS HTTP ${response.status}: ${await response.text()}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = Buffer.from(arrayBuffer)

      if (audioBuffer.length < 100) throw new Error('Aliyun TTS returned empty audio')

      // 粗略估算时长：MP3 128kbps ≈ 16KB/s
      const durationMs = Math.round((audioBuffer.length / 16000) * 1000)

      return { audioBuffer, durationMs }
    } catch (err) {
      lastError = err as Error
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }

  throw new Error(`Aliyun TTS failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}
```

- [ ] **步骤 2：创建 MiMo TTS `src/lib/services/tts-mimo.ts`**

```typescript
import { EXTERNAL_TIMEOUT_MS, MAX_RETRIES } from '@/types/pipeline'

interface TtsOptions {
  text: string
  voiceId: string
  speed?: number
}

interface TtsResult {
  audioBuffer: Buffer
  durationMs: number
}

export async function synthesizeMimo(options: TtsOptions): Promise<TtsResult> {
  const { text, voiceId, speed = 1.0 } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS)

      const baseUrl = process.env.MIMO_BASE_URL || 'https://api.mimo.audio'
      const response = await fetch(`${baseUrl}/v1/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MIMO_API_KEY!}`,
        },
        body: JSON.stringify({
          model: 'mimo-tts',
          input: text,
          voice: voiceId,
          speed,
          response_format: 'mp3',
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`MiMo TTS HTTP ${response.status}: ${await response.text()}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = Buffer.from(arrayBuffer)

      if (audioBuffer.length < 100) throw new Error('MiMo TTS returned empty audio')

      const durationMs = Math.round((audioBuffer.length / 16000) * 1000)

      return { audioBuffer, durationMs }
    } catch (err) {
      lastError = err as Error
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }

  throw new Error(`MiMo TTS failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}
```

- [ ] **步骤 3：创建 TTS 路由 `src/lib/services/tts-router.ts`**

```typescript
import { synthesizeAliyun } from './tts-aliyun'
import { synthesizeMimo } from './tts-mimo'
import { createAdminClient } from '@/lib/supabase/admin'

interface TtsResult {
  audioBuffer: Buffer
  durationMs: number
}

export async function synthesizeSegment(
  text: string,
  voiceDbId: string
): Promise<TtsResult> {
  const supabase = createAdminClient()

  const { data: voice } = await supabase
    .from('voices')
    .select('provider, provider_voice_id')
    .eq('id', voiceDbId)
    .single()

  if (!voice) throw new Error(`Voice not found: ${voiceDbId}`)

  if (voice.provider === 'aliyun') {
    return synthesizeAliyun({ text, voiceId: voice.provider_voice_id })
  }

  if (voice.provider === 'mimo') {
    return synthesizeMimo({ text, voiceId: voice.provider_voice_id })
  }

  throw new Error(`Unknown TTS provider: ${voice.provider}`)
}
```

- [ ] **步骤 4：创建 TTS 步骤 `src/lib/pipeline/steps/tts.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { synthesizeSegment } from '@/lib/services/tts-router'
import type { ScriptSegment } from '@/types/database'
import type { TtsSegmentResult } from '@/types/pipeline'

export async function executeTtsStep(episodeId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('script, params, preview_url')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const script: ScriptSegment[] = typeof episode.script === 'string'
    ? JSON.parse(episode.script)
    : episode.script

  if (!script || script.length === 0) throw new Error('No script found')

  const params = episode.params as { voice_ids: string[]; roles_count: number }
  const voiceIds = params.voice_ids || []

  // 角色名 → voice_id 映射（按出场顺序分配）
  const roleNames = [...new Set(script.map(s => s.role))]
  const roleToVoice: Record<string, string> = {}
  roleNames.forEach((name, i) => {
    roleToVoice[name] = voiceIds[i % voiceIds.length] || voiceIds[0]
  })

  const results: TtsSegmentResult[] = []
  let totalChars = 0

  // 逐段合成
  for (let i = 0; i < script.length; i++) {
    const segment = script[i]
    const voiceId = roleToVoice[segment.role]

    if (!voiceId) throw new Error(`No voice assigned to role: ${segment.role}`)

    const { audioBuffer, durationMs } = await synthesizeSegment(segment.text, voiceId)

    // 上传到 Supabase Storage
    const path = `${userId}/episodes/${episodeId}/segment-${String(i).padStart(3, '0')}.mp3`
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(path, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadError) throw new Error(`Failed to upload segment ${i}: ${uploadError.message}`)

    results.push({ index: i, audioPath: path, durationMs, charCount: segment.text.length })
    totalChars += segment.text.length
  }

  // 生成 30s 试听样本（前 3 段拼接）
  if (episode.preview_url === 'pending' && results.length >= 1) {
    const previewSegments = results.slice(0, 3)
    const previewPath = `${userId}/episodes/${episodeId}/preview.mp3`

    // 用 FFmpeg 拼接前 3 段为 preview
    const { mixEpisode } = await import('@/lib/services/ffmpeg')
    const { audioBuffer: previewBuffer } = await mixEpisode({
      segmentPaths: previewSegments.map(r => r.audioPath),
      bgmType: 'none',
      userId,
      episodeId,
    })

    await supabase.storage
      .from('audio')
      .upload(previewPath, previewBuffer, { contentType: 'audio/mpeg', upsert: true })

    const { data: { publicUrl } } = supabase.storage
      .from('audio')
      .getPublicUrl(previewPath)

    await supabase.from('episodes').update({ preview_url: publicUrl }).eq('id', episodeId)
  }

  // 保存段落结果到 episode（供 mix 步骤读取）
  await supabase
    .from('episodes')
    .update({ chapters: JSON.stringify(results) })
    .eq('id', episodeId)

  // 记录 TTS 用量
  const ttsCost = (totalChars / 1000) * 0.015
  await supabase.from('usage_logs').insert({
    user_id: userId,
    episode_id: episodeId,
    type: 'tts_char',
    quantity: totalChars,
    cost: ttsCost,
  })
}
```

- [ ] **步骤 5：Commit**

```bash
git add -A
git commit -m "feat: add TTS services (Aliyun + MiMo) and pipeline step"
```

---

### 任务 5：FFmpeg 混音服务 + 步骤

**文件：**
- 创建：`src/lib/services/ffmpeg.ts`, `src/lib/pipeline/steps/mix.ts`

- [ ] **步骤 1：创建 FFmpeg 服务 `src/lib/services/ffmpeg.ts`**

```typescript
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { createAdminClient } from '@/lib/supabase/admin'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFile, unlink, readFile, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

interface MixOptions {
  segmentPaths: string[]     // Storage paths for each segment
  bgmType: string            // 'none' | 'light' | 'calm' | 'tech'
  userId: string
  episodeId: string
}

interface MixOutput {
  audioBuffer: Buffer
  durationMs: number
}

// BGM 文件映射（后续可替换为实际 BGM 文件 URL）
const BGM_MAP: Record<string, string | null> = {
  none: null,
  light: null,   // MVP: 暂无实际 BGM 文件，仅做拼接
  calm: null,
  tech: null,
}

export async function mixEpisode(options: MixOptions): Promise<MixOutput> {
  const { segmentPaths, bgmType, userId, episodeId } = options
  const supabase = createAdminClient()
  const workDir = join(tmpdir(), `podcast-${randomUUID()}`)
  const localFiles: string[] = []

  try {
    // 创建临时工作目录
    await mkdir(workDir, { recursive: true })

    // 下载所有段落到临时目录
    for (let i = 0; i < segmentPaths.length; i++) {
      const { data, error } = await supabase.storage
        .from('audio')
        .download(segmentPaths[i])

      if (error || !data) throw new Error(`Failed to download segment ${i}: ${error?.message}`)

      const buffer = Buffer.from(await data.arrayBuffer())
      const localPath = join(workDir, `seg-${String(i).padStart(3, '0')}.mp3`)
      localFiles.push(localPath)
      await writeFile(localPath, buffer)
    }

    // 生成 concat 文件列表
    const concatList = localFiles.map(f => `file '${f}'`).join('\n')
    const concatPath = join(workDir, 'concat.txt')
    await writeFile(concatPath, concatList)

    // FFmpeg 拼接
    const outputPath = join(workDir, 'output.mp3')

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
        .run()
    })

    const outputBuffer = await readFile(outputPath)
    const durationMs = Math.round((outputBuffer.length / 16000) * 1000)

    return { audioBuffer: outputBuffer, durationMs }
  } finally {
    // 清理临时文件
    for (const f of localFiles) {
      await unlink(f).catch(() => {})
    }
  }
}
```

- [ ] **步骤 2：创建混音步骤 `src/lib/pipeline/steps/mix.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { mixEpisode } from '@/lib/services/ffmpeg'
import type { TtsSegmentResult } from '@/types/pipeline'

export async function executeMixStep(episodeId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('chapters, params')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const segments: TtsSegmentResult[] = typeof episode.chapters === 'string'
    ? JSON.parse(episode.chapters)
    : episode.chapters

  if (!segments || segments.length === 0) throw new Error('No TTS segments found')

  const params = episode.params as { bgm?: string }
  const bgmType = params.bgm || 'none'

  const segmentPaths = segments.map(s => s.audioPath)

  const { audioBuffer, durationMs } = await mixEpisode({
    segmentPaths,
    bgmType,
    userId,
    episodeId,
  })

  // 上传最终音频
  const outputPath = `${userId}/episodes/${episodeId}/final.mp3`
  const { error: uploadError } = await supabase.storage
    .from('audio')
    .upload(outputPath, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

  if (uploadError) throw new Error(`Failed to upload final audio: ${uploadError.message}`)

  const { data: { publicUrl } } = supabase.storage
    .from('audio')
    .getPublicUrl(outputPath)

  // 更新 episode
  await supabase
    .from('episodes')
    .update({ audio_url: publicUrl })
    .eq('id', episodeId)

  // 记录混音用量
  await supabase.from('usage_logs').insert({
    user_id: userId,
    episode_id: episodeId,
    type: 'mixing',
    quantity: 1,
    cost: 0.01,
  })
}
```

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "feat: add FFmpeg mixing service and pipeline step"
```

---

### 任务 6：后处理 + 素材解析步骤

**文件：**
- 创建：`src/lib/services/post-process.ts`, `src/lib/pipeline/steps/post.ts`, `src/lib/pipeline/steps/parse.ts`, `src/lib/pipeline/steps/confirm.ts`

- [ ] **步骤 1：创建后处理服务 `src/lib/services/post-process.ts`**

```typescript
import OpenAI from 'openai'
import { EXTERNAL_TIMEOUT_MS } from '@/types/pipeline'
import type { ScriptSegment } from '@/types/database'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  timeout: EXTERNAL_TIMEOUT_MS,
})

interface PostProcessResult {
  showNotes: string
  chapters: Array<{ time: string; title: string }>
  coverSuggestion: string
}

export async function generatePostContent(
  topic: string,
  script: ScriptSegment[],
  durationMs: number
): Promise<PostProcessResult> {
  const scriptText = script.map(s => `${s.role}: ${s.text}`).join('\n')

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: `你是播客后期编辑。根据对话脚本生成：
1. show_notes: 节目简介（100-200字，包含要点摘要）
2. chapters: 章节列表（根据话题转换点划分，格式 [{"time":"00:00","title":"开场"}]）
3. cover_suggestion: 封面图文字建议（10字以内的标题 + 副标题）

严格返回 JSON：{"show_notes":"...","chapters":[...],"cover_suggestion":"..."}`,
      },
      {
        role: 'user',
        content: `话题：${topic}\n时长：${Math.round(durationMs / 60000)}分钟\n\n脚本：\n${scriptText.slice(0, 6000)}`,
      },
    ],
    temperature: 0.6,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Empty post-process response')

  const parsed = JSON.parse(content)
  return {
    showNotes: parsed.show_notes || '',
    chapters: parsed.chapters || [],
    coverSuggestion: parsed.cover_suggestion || '',
  }
}
```

- [ ] **步骤 2：创建后处理步骤 `src/lib/pipeline/steps/post.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePostContent } from '@/lib/services/post-process'
import type { ScriptSegment } from '@/types/database'
import type { TtsSegmentResult } from '@/types/pipeline'

export async function executePostStep(episodeId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('topic, script, chapters')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const script: ScriptSegment[] = typeof episode.script === 'string'
    ? JSON.parse(episode.script)
    : episode.script

  const segments: TtsSegmentResult[] = typeof episode.chapters === 'string'
    ? JSON.parse(episode.chapters)
    : episode.chapters

  const totalDurationMs = segments?.reduce((sum, s) => sum + s.durationMs, 0) || 0

  const { showNotes, chapters, coverSuggestion } = await generatePostContent(
    episode.topic,
    script,
    totalDurationMs
  )

  await supabase
    .from('episodes')
    .update({
      show_notes: showNotes,
      chapters: JSON.stringify(chapters),
      cover_url: coverSuggestion,  // MVP: 存文字建议，非图片
    })
    .eq('id', episodeId)
}
```

- [ ] **步骤 3：创建素材解析步骤 `src/lib/pipeline/steps/parse.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { parseMaterial } from '@/lib/services/parser'

export async function executeParseStep(episodeId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('materials')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const materials = episode.materials as Array<{ type: string; url: string; text?: string; extracted_text?: string }>

  if (!materials || materials.length === 0) return  // 无素材，跳过

  const updated = [...materials]

  for (let i = 0; i < updated.length; i++) {
    const mat = updated[i]
    if (mat.extracted_text) continue  // 已解析

    if (mat.type === 'url' && mat.url) {
      const parsed = await parseMaterial({ url: mat.url })
      updated[i] = { ...mat, extracted_text: parsed.text }
    } else if (mat.type === 'text' && mat.text) {
      updated[i] = { ...mat, extracted_text: mat.text }
    }
    // file 类型：MVP 暂不支持从 Storage 下载后解析（需要 service role 读取）
    // 后续迭代补充
  }

  await supabase
    .from('episodes')
    .update({ materials: JSON.stringify(updated) })
    .eq('id', episodeId)
}
```

- [ ] **步骤 4：创建确认步骤 `src/lib/pipeline/steps/confirm.ts`**

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 确认步骤：检查用户是否设置了跳过确认
 * 如果跳过 → 直接继续到 tts_processing
 * 如果不跳过 → 状态停在 script_ready，等用户通过 /api/episodes/[id]/confirm 确认
 */
export async function executeConfirmStep(episodeId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('params')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const params = episode.params as { skip_confirmation?: boolean }

  if (!params.skip_confirmation) {
    // 不跳过 → 暂停 pipeline，等用户确认
    // 状态已在 orchestrator 中设为 script_ready
    // 用户确认后由 /api/episodes/[id]/confirm 触发 tts_processing
    throw new Error('WAITING_FOR_CONFIRMATION')
  }

  // 跳过确认，直接继续（orchestrator 会触发下一步）
}
```

- [ ] **步骤 5：Commit**

```bash
git add -A
git commit -m "feat: add post-processing, parsing, and confirm pipeline steps"
```

---

### 任务 7：Pipeline API 路由 + 注册步骤 + 触发集成

**文件：**
- 创建：`src/app/api/pipeline/advance/route.ts`, `src/app/api/episodes/[id]/confirm/route.ts`, `src/app/api/episodes/[id]/retry/route.ts`
- 修改：`src/app/api/episodes/route.ts`（POST 触发 pipeline）

- [ ] **步骤 1：创建 Pipeline 推进 API `src/app/api/pipeline/advance/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { advancePipeline, registerStep } from '@/lib/pipeline/orchestrator'
import { executeParseStep } from '@/lib/pipeline/steps/parse'
import { executeScriptStep } from '@/lib/pipeline/steps/script'
import { executeConfirmStep } from '@/lib/pipeline/steps/confirm'
import { executeTtsStep } from '@/lib/pipeline/steps/tts'
import { executeMixStep } from '@/lib/pipeline/steps/mix'
import { executePostStep } from '@/lib/pipeline/steps/post'
import type { PipelineStep } from '@/types/pipeline'

// 注册所有步骤执行器
registerStep('parsing', executeParseStep)
registerStep('scripting', executeScriptStep)
registerStep('confirming', executeConfirmStep)
registerStep('tts_processing', executeTtsStep)
registerStep('mixing', executeMixStep)
registerStep('post_processing', executePostStep)

export async function POST(request: NextRequest) {
  // 内部调用鉴权
  const secret = request.headers.get('x-pipeline-secret')
  if (secret !== process.env.PIPELINE_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { episodeId, userId, step, attempt } = body as {
    episodeId: string
    userId: string
    step: PipelineStep
    attempt?: number
  }

  if (!episodeId || !userId || !step) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Upstash Redis 并发控制：每用户最多 1 个并发 Pipeline
  const { Redis } = await import('@upstash/redis')
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_URL!,
    token: process.env.UPSTASH_REDIS_TOKEN!,
  })
  const lockKey = `pipeline:lock:${userId}`
  const acquired = await redis.set(lockKey, episodeId, { nx: true, ex: 300 })
  if (!acquired) {
    return NextResponse.json({ error: 'Pipeline already running' }, { status: 409 })
  }

  const result = await advancePipeline(episodeId, userId, step, attempt || 1)

  if (!result.success) {
    // 特殊处理：等待确认不是错误
    if (result.error === 'WAITING_FOR_CONFIRMATION') {
      return NextResponse.json({ status: 'waiting_for_confirmation' })
    }
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ status: 'advanced', step })
}
```

- [ ] **步骤 2：创建确认 API `src/app/api/episodes/[id]/confirm/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 验证 episode 属于当前用户且状态为 script_ready
  const { data: episode } = await supabase
    .from('episodes')
    .select('id, status, user_id')
    .eq('id', id)
    .single()

  if (!episode || episode.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (episode.status !== 'script_ready') {
    return NextResponse.json(
      { error: `Cannot confirm in status: ${episode.status}` },
      { status: 400 }
    )
  }

  // 触发 tts_processing 步骤
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  await fetch(`${baseUrl}/api/pipeline/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
    },
    body: JSON.stringify({
      episodeId: id,
      userId: user.id,
      step: 'tts_processing',
      attempt: 1,
    }),
  })

  return NextResponse.json({ status: 'confirmed', next: 'tts_processing' })
}
```

- [ ] **步骤 3：创建重试 API `src/app/api/episodes/[id]/retry/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PipelineStep } from '@/types/pipeline'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: episode } = await admin
    .from('episodes')
    .select('id, status, failed_at_step, user_id')
    .eq('id', id)
    .single()

  if (!episode || episode.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (episode.status !== 'failed' || !episode.failed_at_step) {
    return NextResponse.json({ error: 'Episode is not in failed state' }, { status: 400 })
  }

  const retryStep = episode.failed_at_step as PipelineStep

  // 触发重试
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  await fetch(`${baseUrl}/api/pipeline/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
    },
    body: JSON.stringify({
      episodeId: id,
      userId: user.id,
      step: retryStep,
      attempt: 1,
    }),
  })

  return NextResponse.json({ status: 'retrying', step: retryStep })
}
```

- [ ] **步骤 4：修改 episodes POST 触发 pipeline**

在 `src/app/api/episodes/route.ts` 的 POST handler 末尾，创建成功后触发 pipeline：

```typescript
// 在 return NextResponse.json(data, { status: 201 }) 之前添加：

// 触发 pipeline 第一步（parsing）
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
fetch(`${baseUrl}/api/pipeline/advance`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
  },
  body: JSON.stringify({
    episodeId: data.id,
    userId: user.id,
    step: 'parsing',
    attempt: 1,
  }),
}).catch(() => {})  // fire-and-forget，不阻塞响应
```

- [ ] **步骤 5：Commit**

```bash
git add -A
git commit -m "feat: add pipeline API routes and integrate with episode creation"
```

---

### 任务 8：集成验证 + 构建检查

- [ ] **步骤 1：运行 TypeScript 检查**

```bash
npx tsc --noEmit
```
预期：0 错误。如有类型不匹配，修复。

- [ ] **步骤 2：运行构建**

```bash
npm run build
```
预期：构建成功，所有路由正常生成。

- [ ] **步骤 3：验证路由列表**

确认新增路由存在：
- `/api/pipeline/advance`
- `/api/episodes/[id]/confirm`
- `/api/episodes/[id]/retry`

- [ ] **步骤 4：Commit 修复（如有）**

```bash
git add -A
git commit -m "fix: resolve integration issues in pipeline"
```

---

## M3 完成标准

- [ ] 创建 episode 后自动触发 pipeline（parsing → scripting → script_ready）
- [ ] DeepSeek 生成结构化对话脚本 `[{role, text, emotion, pause_ms}]`
- [ ] 脚本保存到 episode.script
- [ ] skip_confirmation=true 时自动继续到 TTS
- [ ] skip_confirmation=false 时停在 script_ready 等用户确认
- [ ] POST /api/episodes/[id]/confirm 触发 TTS
- [ ] TTS 逐段合成并上传到 Storage
- [ ] 30s 试听样本生成
- [ ] FFmpeg 拼接所有段落为最终音频
- [ ] 后处理生成 show notes + 章节
- [ ] 失败时状态为 failed + failed_at_step 记录
- [ ] POST /api/episodes/[id]/retry 从失败步骤重试
- [ ] 步骤日志记录在 episode_steps 表
- [ ] 用量记录在 usage_logs 表
- [ ] TypeScript 无类型错误
- [ ] `npm run build` 通过

---

## 后续里程碑

- M4：剧集详情（播放器 + 脚本编辑 + 进度追踪 + Realtime）
- M5：计费（Stripe 充值 + 按量扣费 + 账单页）
- M6：打磨（落地页 + PostHog + Sentry + 部署）