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
