import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import type { ScriptSegment } from '@/types/database'
import { validateSegments, normalizeSegments, validateFinal } from '@/lib/services/script-validate'
import { logLlmUsage } from '@/lib/services/usage-logger'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  timeout: 60000,
})

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

const BASE_SYSTEM_PROMPT = `你是播客脚本润色助手。用户会给你一段播客对话脚本，请：
1. 让对话更口语化、自然
2. 补充适当的过渡语和语气词
3. 保持原意不变，不增删核心内容
4. 保持角色名不变

严格返回 JSON：{"segments":[{"role":"角色名","text":"润色后台词","emotion":"情绪","pause_ms":300}]}
不要输出其他内容。`

const STRICT_APPENDIX = `

【严格模式】
- 必须返回合法 JSON，不要输出 markdown 代码块
- segments 数组不能为空
- 每个 segment 必须有 role、text、emotion、pause_ms 字段
- 如果无法润色，原样返回 segments`

async function llmPolish(
  scriptText: string,
  strict: boolean
): Promise<{ segments: ScriptSegment[]; usage: { prompt: number; completion: number } } | null> {
  const system = strict ? BASE_SYSTEM_PROMPT + STRICT_APPENDIX : BASE_SYSTEM_PROMPT

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: scriptText },
    ],
    max_tokens: 8192,
    temperature: strict ? 0.3 : 0.7,
    response_format: { type: 'json_object' },
  })

  const content = res.choices[0]?.message?.content?.trim() || ''
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0])
    const rawPolished = parsed.segments || []
    if (!validateSegments(rawPolished)) return null

    const polished = normalizeSegments(rawPolished as ScriptSegment[])
    if (!validateFinal(polished)) return null

    return {
      segments: polished,
      usage: {
        prompt: res.usage?.prompt_tokens || 0,
        completion: res.usage?.completion_tokens || 0,
      },
    }
  } catch {
    return null
  }
}

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

  const MAX_RETRIES = 2
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await llmPolish(scriptText, attempt === 2)
      if (result && result.segments.length > 0) {
        await logLlmUsage(user.id, result.usage.prompt, result.usage.completion)
        return NextResponse.json({ segments: result.segments, attempt })
      }
    } catch (err) {
      console.error(`[script/polish] attempt ${attempt} error:`, err)
    }
  }

  return NextResponse.json(
    { error: 'AI 润色失败（已重试 2 次），请重试' },
    { status: 502 }
  )
}
