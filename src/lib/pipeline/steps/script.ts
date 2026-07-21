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
