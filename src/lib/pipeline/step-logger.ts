import { createAdminClient } from '@/lib/supabase/admin'
import type { PipelineStep } from '@/types/pipeline'

export async function logStepStart(episodeId: string, step: PipelineStep, attempt: number) {
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('episode_steps')
    .select('id')
    .eq('episode_id', episodeId)
    .eq('step', step)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('episode_steps')
      .update({ status: 'running', attempt, started_at: new Date().toISOString(), error_message: null })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('episode_steps')
      .insert({ episode_id: episodeId, step, status: 'running', attempt })
  }
}

export async function logStepDone(episodeId: string, step: PipelineStep) {
  const supabase = createAdminClient()
  await supabase
    .from('episode_steps')
    .update({ status: 'done', finished_at: new Date().toISOString() })
    .eq('episode_id', episodeId)
    .eq('step', step)
}

export async function logStepFailed(episodeId: string, step: PipelineStep, error: string) {
  const supabase = createAdminClient()
  await supabase
    .from('episode_steps')
    .update({ status: 'failed', finished_at: new Date().toISOString(), error_message: error })
    .eq('episode_id', episodeId)
    .eq('step', step)
}
