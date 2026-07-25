import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'
import type { ScriptSegment } from '@/types/database'
import { validateSegments, normalizeSegments, validateFinal } from '@/lib/services/script-validate'
import { logLlmUsage } from '@/lib/services/usage-logger'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  timeout: 25000,
})

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

const BASE_SYSTEM_PROMPT = `你是播客脚本解析器。用户会给你一段文本，可能是：
- 完整的播客对话脚本（含角色名和台词）
- LLM 生成的脚本（含标题、元数据、说明文字等噪音）
- 纯文本文章

你的任务：从中提取出纯粹的对话台词，去掉所有非对话内容（标题、节目名、时长说明、风格说明、分隔线、markdown 标记、括号内的舞台指示等）。

严格返回 JSON：{"segments":[{"role":"角色名","text":"台词内容","emotion":"情绪","pause_ms":300}]}

规则：
1. 只保留角色实际说出的话
2. 角色名保持原文（如「小林」「老陈」「主播」）
3. 如果原文没有明确角色名，用「主播」
4. 去掉「好的，这是一个...」「以下是...」等 LLM 前言
5. 去掉 markdown 标题（##）、加粗（**）、分隔线（---）
6. 每段台词不超过 200 字，超长则拆分
7. emotion 从以下选择：中性/开心/惊讶/思考/兴奋
8. 不要输出任何解释，只输出 JSON`

const STRICT_APPENDIX = `

【严格模式】
- 严禁输出任何元数据、标题、节目名、时长、风格说明
- 严禁输出分隔线（---）、markdown 标记（##、**）
- 如果无法提取出有效对话，返回 {"segments":[]}
- 角色名不能包含 *、#、> 等标记符号
- 台词不能是纯分隔线或空内容`

async function llmParse(
  rawText: string,
  strict: boolean
): Promise<{ segments: ScriptSegment[]; usage: { prompt: number; completion: number } } | null> {
  const system = strict ? BASE_SYSTEM_PROMPT + STRICT_APPENDIX : BASE_SYSTEM_PROMPT

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: rawText.slice(0, 12000) },
    ],
    max_tokens: 8192,
    temperature: strict ? 0.1 : 0.3,
    response_format: { type: 'json_object' },
  })

  const content = res.choices[0]?.message?.content?.trim() || ''
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0])
    const rawSegments = parsed.segments || parsed.script || parsed.data
    if (!validateSegments(rawSegments)) return null

    const normalized = normalizeSegments(rawSegments as ScriptSegment[])
    if (!validateFinal(normalized)) return null

    return {
      segments: normalized,
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
  const rawText: string = body.rawText || ''

  if (!rawText.trim()) {
    return NextResponse.json({ error: 'rawText required' }, { status: 400 })
  }

  const MAX_RETRIES = 2
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // 客户端已断开则停止重试，避免浪费 LLM token
    if (request.signal.aborted) break
    try {
      const result = await llmParse(rawText, attempt === 2)
      if (result && result.segments.length > 0) {
        // 使用 after() 保证 Serverless 环境下响应后仍执行计费日志
        after(() => logLlmUsage(user.id, result.usage.prompt, result.usage.completion))
        return NextResponse.json({ segments: result.segments, attempt })
      }
    } catch (err) {
      console.error(`[script/parse] attempt ${attempt} error:`, err)
    }
  }

  return NextResponse.json(
    { error: 'AI 解析失败（已重试 2 次），请修改文本后重试', attempts: MAX_RETRIES },
    { status: 502 }
  )
}
