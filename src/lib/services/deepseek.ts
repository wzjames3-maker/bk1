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
  materials: string       // 合并后的素材纯文本
  durationMin: number
  style: string
  rolesCount: number
  voiceNames: string[]    // 角色名称列表
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
        max_tokens: 8192,
        response_format: { type: 'json_object' },
      })

      const message = response.choices[0]?.message as {
        content?: string | null
        reasoning_content?: string | null
      } | undefined
      const content = message?.content || message?.reasoning_content
      if (!content) throw new Error('Empty response from DeepSeek')

      const segments = extractSegments(content)
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
