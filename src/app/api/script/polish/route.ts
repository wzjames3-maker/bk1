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

  try {
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

    const parsed = JSON.parse(jsonMatch[0])
    const rawPolished = parsed.segments || []
    if (!validateSegments(rawPolished)) {
      return NextResponse.json({ error: 'AI 返回格式错误，请重试' }, { status: 502 })
    }

    const polished = normalizeSegments(rawPolished as ScriptSegment[])
    if (!validateFinal(polished)) {
      return NextResponse.json({ error: 'AI 返回为空，请重试' }, { status: 502 })
    }

    const promptTokens = res.usage?.prompt_tokens || 0
    const completionTokens = res.usage?.completion_tokens || 0
    await logLlmUsage(user.id, promptTokens, completionTokens)

    return NextResponse.json({ segments: polished })
  } catch (err) {
    console.error('[script/polish] error:', err)
    return NextResponse.json({ error: 'AI 润色服务异常' }, { status: 500 })
  }
}
