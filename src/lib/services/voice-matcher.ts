import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  timeout: 30000,
})

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

export interface VoiceOption {
  id: string
  name: string
  gender: 'male' | 'female'
  style: string
}

export async function matchVoices(
  roles: string[],
  voices: VoiceOption[]
): Promise<Record<string, string>> {
  if (roles.length === 0) return {}
  if (voices.length === 0) return {}

  // 单角色直接分配第一个音色
  if (roles.length === 1) return { [roles[0]]: voices[0].id }

  try {
    const voiceList = voices
      .map(v => `- id=${v.id}, name=${v.name}, gender=${v.gender === 'male' ? '男' : '女'}, style=${v.style}`)
      .join('\n')

    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `你是播客音色分配助手。根据角色名称和可用音色，为每个角色选择最合适的音色。
仅返回 JSON 对象，格式：{"角色名": "voice_id", ...}
不要输出任何其他内容。`,
        },
        {
          role: 'user',
          content: `角色列表：${roles.join('、')}\n\n可用音色：\n${voiceList}`,
        },
      ],
      max_tokens: 200,
      temperature: 0,
    })

    const content = res.choices[0]?.message?.content?.trim() || '{}'
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const mapping = JSON.parse(jsonMatch[0]) as Record<string, string>

    // 验证所有 voice_id 合法
    const validIds = new Set(voices.map(v => v.id))
    for (const role of roles) {
      if (!mapping[role] || !validIds.has(mapping[role])) {
        delete mapping[role]
      }
    }

    // 补全未匹配的角色（轮询兜底）
    let idx = 0
    for (const role of roles) {
      if (!mapping[role]) {
        mapping[role] = voices[idx % voices.length].id
        idx++
      }
    }

    return mapping
  } catch {
    // LLM 失败，轮询兜底
    const fallback: Record<string, string> = {}
    roles.forEach((role, i) => {
      fallback[role] = voices[i % voices.length].id
    })
    return fallback
  }
}
