import { createAdminClient } from '@/lib/supabase/admin'
import { llmTokenCost } from '@/lib/services/cost'

/**
 * 记录 LLM 用量（service role 写入，绕过 RLS）
 * 用于创建前的解析/润色等无 episode_id 场景
 */
export async function logLlmUsage(
  userId: string,
  promptTokens: number,
  completionTokens: number,
  episodeId?: string
): Promise<void> {
  const admin = createAdminClient()
  const totalTokens = promptTokens + completionTokens
  const cost = llmTokenCost(totalTokens)

  const { error } = await admin.from('usage_logs').insert({
    user_id: userId,
    episode_id: episodeId || null,
    type: 'llm_token',
    quantity: totalTokens,
    cost,
  })

  if (error) {
    console.error('[usage-logger] failed to log usage:', error.message)
  }
}
