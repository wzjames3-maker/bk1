import { createAdminClient } from '@/lib/supabase/admin'
import { canTransition, getNextStep, getStepStatus } from './state-machine'
import { logStepStart, logStepDone, logStepFailed } from './step-logger'
import { MAX_STEPS, type PipelineStep } from '@/types/pipeline'
import type { EpisodeStatus } from '@/types/database'
import { settle, refund } from '@/lib/services/billing'

type StepExecutor = (episodeId: string, userId: string) => Promise<void>
const stepExecutors: Partial<Record<PipelineStep, StepExecutor>> = {}

export function registerStep(step: PipelineStep, executor: StepExecutor) {
  stepExecutors[step] = executor
}

export async function advancePipeline(
  episodeId: string,
  userId: string,
  currentStep: PipelineStep,
  attempt: number = 1
): Promise<{ success: boolean; error?: string; nextStep?: PipelineStep | null }> {
  const supabase = createAdminClient()

  // 最大步数守卫
  if (attempt > MAX_STEPS) {
    return { success: false, error: `Max steps exceeded (${MAX_STEPS})` }
  }

  const { data: episode } = await supabase
    .from('episodes')
    .select('status')
    .eq('id', episodeId)
    .single()

  if (!episode) return { success: false, error: 'Episode not found' }

  const targetStatus = getStepStatus(currentStep)

  if (!canTransition(episode.status as EpisodeStatus, targetStatus)) {
    return { success: false, error: `Invalid transition: ${episode.status} → ${targetStatus}` }
  }

  await supabase
    .from('episodes')
    .update({ status: targetStatus })
    .eq('id', episodeId)

  await logStepStart(episodeId, currentStep, attempt)

  try {
    const executor = stepExecutors[currentStep]
    if (!executor) throw new Error(`No executor registered for step: ${currentStep}`)

    await executor(episodeId, userId)

    await logStepDone(episodeId, currentStep)

    // 编剧完成 → 状态设为 script_ready
    // 若用户勾选跳过确认，继续进入 confirming（内部会直通 TTS）
    if (currentStep === 'scripting') {
      await supabase.from('episodes').update({ status: 'script_ready' }).eq('id', episodeId)
      const { data: epAfterScript } = await supabase
        .from('episodes')
        .select('params')
        .eq('id', episodeId)
        .single()
      const scriptParams = epAfterScript?.params as { skip_confirmation?: boolean } | null
      if (scriptParams?.skip_confirmation) {
        return { success: true, nextStep: 'confirming' }
      }
      return { success: true }
    }

    // 返回下一步信息，由 route 层在释放锁后触发
    const nextStep = getNextStep(currentStep)
    if (nextStep) {
      return { success: true, nextStep }
    } else {
      // 汇总真实用量后结算
      const { data: usageRows } = await supabase
        .from('usage_logs')
        .select('cost')
        .eq('episode_id', episodeId)
      const actualCost = Number(
        ((usageRows || []).reduce((sum, row) => sum + Number(row.cost || 0), 0)).toFixed(6)
      )

      await supabase
        .from('episodes')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          actual_cost: actualCost,
        })
        .eq('id', episodeId)

      const { data: ep } = await supabase
        .from('episodes')
        .select('estimated_cost, user_id')
        .eq('id', episodeId)
        .single()
      if (ep && ep.estimated_cost) {
        await settle(ep.user_id, episodeId, Number(ep.estimated_cost), actualCost)
      }
    }

    return { success: true, nextStep: null }
  } catch (err) {
    const errorMsg = (err as Error).message

    // 等待确认不是失败——状态回退到 script_ready
    if (errorMsg === 'WAITING_FOR_CONFIRMATION') {
      await logStepDone(episodeId, currentStep)
      await supabase.from('episodes').update({ status: 'script_ready' }).eq('id', episodeId)
      return { success: true }
    }

    await logStepFailed(episodeId, currentStep, errorMsg)
    await supabase
      .from('episodes')
      .update({ status: 'failed', failed_at_step: currentStep })
      .eq('id', episodeId)

    // Pipeline 失败 → 退还预扣
    const { data: failedEp } = await supabase
      .from('episodes')
      .select('estimated_cost, user_id')
      .eq('id', episodeId)
      .single()
    if (failedEp && failedEp.estimated_cost) {
      await refund(failedEp.user_id, episodeId, failedEp.estimated_cost)
    }

    return { success: false, error: errorMsg }
  }
}
