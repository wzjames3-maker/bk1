import type { EpisodeStatus } from '@/types/database'
import { STEP_ORDER, STEP_TO_STATUS, type PipelineStep } from '@/types/pipeline'

const VALID_TRANSITIONS: Record<EpisodeStatus, EpisodeStatus[]> = {
  pending: ['parsing', 'failed'],
  parsing: ['scripting', 'failed'],
  scripting: ['script_ready', 'failed'],
  script_ready: ['confirming', 'tts_processing', 'failed'],
  confirming: ['tts_processing', 'failed'],
  tts_processing: ['mixing', 'failed'],
  mixing: ['post_processing', 'failed'],
  post_processing: ['completed', 'failed'],
  completed: [],
  failed: ['parsing', 'scripting', 'confirming', 'tts_processing', 'mixing', 'post_processing'],
}

export function canTransition(from: EpisodeStatus, to: EpisodeStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function getNextStep(current: PipelineStep): PipelineStep | null {
  const idx = STEP_ORDER.indexOf(current)
  if (idx === -1 || idx >= STEP_ORDER.length - 1) return null
  return STEP_ORDER[idx + 1]
}

export function getStepStatus(step: PipelineStep): EpisodeStatus {
  return STEP_TO_STATUS[step]
}
