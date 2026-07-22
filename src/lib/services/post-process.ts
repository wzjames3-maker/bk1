import OpenAI from 'openai'
import { EXTERNAL_TIMEOUT_MS } from '@/types/pipeline'
import type { ScriptSegment } from '@/types/database'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  timeout: Math.max(EXTERNAL_TIMEOUT_MS, 120000),
})

const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

interface PostProcessResult {
  summary: string
  highlights: string[]
  coverSuggestion: string
  chapterTitles?: string[]
}

export async function generatePostContent(
  topic: string,
  script: ScriptSegment[],
  durationMs: number,
  chapterCount = 0
): Promise<PostProcessResult> {
  const scriptText = script.map(s => `${s.role}: ${s.text}`).join('\n')
  const durationSec = Math.max(1, Math.round(durationMs / 1000))
  const durationLabel = `${Math.floor(durationSec / 60)}分${String(durationSec % 60).padStart(2, '0')}秒`

  const chapterHint = chapterCount > 0
    ? `\n4. chapter_titles: 恰好 ${chapterCount} 个中文章节标题（每个 4-12 字，按内容顺序，不要时间戳；禁止「开场」「总结」「第一部分」「第二部分」「结尾」「引言」）`
    : ''

  const response = await client.chat.completions.create({
    model: DEEPSEEK_MODEL,
    messages: [
      {
        role: 'system',
        content: `你是播客后期编辑。根据对话脚本生成：
1. summary: 节目简介（100-200字）
2. highlights: 3-5 个要点（短句数组）
3. cover_suggestion: 封面图文字建议（10字以内的标题 + 副标题）${chapterHint}

注意：不要生成章节时间轴或 time 字段。
严格返回 JSON：{"summary":"...","highlights":["..."],"cover_suggestion":"...${chapterCount > 0 ? '","chapter_titles":["具体标题", "..."]' : '"'}}`,
      },
      {
        role: 'user',
        content: `话题：${topic}\n实际音频时长：${durationLabel}\n\n脚本：\n${scriptText.slice(0, 6000)}`,
      },
    ],
    temperature: 0.6,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error('Empty post-process response')

  const parsed = JSON.parse(content)
  const titles = Array.isArray(parsed.chapter_titles)
    ? parsed.chapter_titles.map((t: unknown) => String(t || '').trim()).filter(Boolean)
    : []

  const highlights = Array.isArray(parsed.highlights)
    ? parsed.highlights.map((h: unknown) => String(h || '').trim()).filter(Boolean)
    : []

  const summary =
    (typeof parsed.summary === 'string' && parsed.summary) ||
    (typeof parsed.show_notes === 'string' && parsed.show_notes) ||
    ''

  return {
    summary,
    highlights,
    coverSuggestion: parsed.cover_suggestion || '',
    chapterTitles: titles,
  }
}
