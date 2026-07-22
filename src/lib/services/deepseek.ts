import OpenAI from 'openai'
import { EXTERNAL_TIMEOUT_MS, MAX_RETRIES } from '@/types/pipeline'
import type { ScriptSegment } from '@/types/database'
import {
  buildStyleSystemAppendix,
  getStylePreset,
  targetCharCount,
} from '@/lib/services/style-presets'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  timeout: Math.max(EXTERNAL_TIMEOUT_MS, 120000),
})

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

interface ScriptGenInput {
  topic: string
  materials: string
  durationMin: number
  style: string
  rolesCount: number
  voiceNames: string[]
}

const SYSTEM_PROMPT = `你是一个专业的播客编剧。根据用户提供的素材和话题，生成一段自然、有深度的多人对话脚本。

必须严格返回 JSON 对象，格式如下：
{"segments":[{"role":"角色名","text":"对话内容","emotion":"情绪(中性/开心/惊讶/思考/兴奋)","pause_ms":300}]}

规则：
1. segments 不能为空
2. 对话要口语化、自然，像真人聊天
3. 中文为主，专业术语可用英文（如 Transformer、Agent）
4. 角色之间要有互动、追问、回应；若只有 1 个角色，则用独白形式
5. 根据目标时长控制总字数（每分钟约 250 字）
6. 开头有简短的节目开场白，结尾有总结收尾
7. pause_ms 用于控制节奏，范围 200-1000`

function extractSegments(content: string): ScriptSegment[] {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const parsed = JSON.parse(cleaned)
  if (Array.isArray(parsed)) return parsed as ScriptSegment[]
  if (Array.isArray(parsed.segments)) return parsed.segments as ScriptSegment[]
  if (Array.isArray(parsed.script)) return parsed.script as ScriptSegment[]
  if (Array.isArray(parsed.data)) return parsed.data as ScriptSegment[]

  for (const value of Object.values(parsed || {})) {
    if (Array.isArray(value) && value.length > 0 && value[0] && typeof value[0] === 'object' && 'text' in (value[0] as object)) {
      return value as ScriptSegment[]
    }
  }
  return []
}

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

function normalizeSegment(
  raw: Partial<ScriptSegment> & { text?: string; role?: string }
): ScriptSegment {
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

export async function generateScript(input: ScriptGenInput): Promise<{
  segments: ScriptSegment[]
  tokenUsage: { prompt: number; completion: number }
}> {
  const { topic, materials, durationMin, style, rolesCount, voiceNames } = input

  const targetChars = targetCharCount(durationMin, style)
  const styleLabel = getStylePreset(style).label
  const rolesDesc = voiceNames.slice(0, rolesCount).join('、')
  const system = SYSTEM_PROMPT + '\n' + buildStyleSystemAppendix(style)

  const userPrompt = `话题：${topic}
风格：${styleLabel}（code=${style}）
角色：${rolesDesc}（共 ${rolesCount} 人）
目标时长：${durationMin} 分钟（约 ${targetChars} 字）

参考素材：
${materials.slice(0, 8000)}

请返回 JSON 对象，包含非空 segments 数组。`

  const { content, tokenUsage } = await chatJson(system, userPrompt, 8192)
  const segments = extractSegments(content)
  if (segments.length === 0) throw new Error('Generated script is empty')
  return { segments, tokenUsage }
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
