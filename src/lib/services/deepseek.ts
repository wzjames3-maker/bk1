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
