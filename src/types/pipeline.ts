import type { EpisodeStatus, ScriptSegment } from './database'

export type PipelineStep =
  | 'parsing'
  | 'scripting'
  | 'confirming'
  | 'tts_processing'
  | 'mixing'
  | 'post_processing'

export const STEP_ORDER: PipelineStep[] = [
  'parsing',
  'scripting',
  'confirming',
  'tts_processing',
  'mixing',
  'post_processing',
]

export const STATUS_TO_STEP: Partial<Record<EpisodeStatus, PipelineStep>> = {
  parsing: 'parsing',
  scripting: 'scripting',
  script_ready: 'confirming',
  confirming: 'confirming',
  tts_processing: 'tts_processing',
  mixing: 'mixing',
  post_processing: 'post_processing',
}

export const STEP_TO_STATUS: Record<PipelineStep, EpisodeStatus> = {
  parsing: 'parsing',
  scripting: 'scripting',
  confirming: 'confirming',
  tts_processing: 'tts_processing',
  mixing: 'mixing',
  post_processing: 'post_processing',
}

export interface PipelineContext {
  episodeId: string
  userId: string
  currentStep: PipelineStep
  attempt: number
}

export interface TtsSegmentResult {
  index: number
  audioPath: string
  durationMs: number
  charCount: number
}

export interface MixResult {
  audioPath: string
  durationMs: number
}

export const MAX_STEPS = 10
export const MAX_RETRIES = 3
export const EXTERNAL_TIMEOUT_MS = 60000
