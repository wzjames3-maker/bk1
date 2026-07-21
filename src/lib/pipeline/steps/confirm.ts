import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 确认步骤：检查用户是否设置了跳过确认
 * 如果跳过 → 直接继续到 tts_processing
 * 如果不跳过 → 状态停在 script_ready，等用户通过 /api/episodes/[id]/confirm 确认
 */
export async function executeConfirmStep(episodeId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('params')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const params = episode.params as { skip_confirmation?: boolean }

  if (!params.skip_confirmation) {
    // 不跳过 → 暂停 pipeline，等用户确认
    // 状态已在 orchestrator 中设为 script_ready
    // 用户确认后由 /api/episodes/[id]/confirm 触发 tts_processing
    throw new Error('WAITING_FOR_CONFIRMATION')
  }

  // 跳过确认，直接继续（orchestrator 会触发下一步）
}
