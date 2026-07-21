export type EpisodeStatus =
  | 'pending' | 'parsing' | 'scripting' | 'script_ready'
  | 'confirming' | 'tts_processing' | 'mixing'
  | 'post_processing' | 'completed' | 'failed'

export type StepStatus = 'pending' | 'running' | 'done' | 'failed'

export interface Profile {
  id: string
  name: string | null
  avatar_url: string | null
  balance: number
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  description: string | null
  voice_config: Record<string, unknown>
  bgm_config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ScriptSegment {
  role: string
  text: string
  emotion: string
  pause_ms: number
}

export interface Episode {
  id: string
  project_id: string | null
  user_id: string
  title: string | null
  status: EpisodeStatus
  failed_at_step: string | null
  topic: string
  params: {
    duration_min: number
    style: string
    roles_count: number
  }
  materials: Array<{ type: string; url: string; extracted_text?: string }>
  script: ScriptSegment[] | null
  audio_url: string | null
  show_notes: string | null
  chapters: Array<{ time: string; title: string }> | null
  cover_url: string | null
  preview_url: string | null
  estimated_cost: number | null
  actual_cost: number | null
  created_at: string
  completed_at: string | null
}

export interface EpisodeStep {
  id: string
  episode_id: string
  step: string
  status: StepStatus
  attempt: number
  error_message: string | null
  started_at: string | null
  finished_at: string | null
}

export interface Voice {
  id: string
  name: string
  gender: 'male' | 'female'
  style: string
  provider: 'aliyun' | 'mimo'
  provider_voice_id: string
  sample_url: string | null
  is_active: boolean
}

export interface UsageLog {
  id: string
  user_id: string
  episode_id: string | null
  type: 'llm_token' | 'tts_char' | 'storage_mb' | 'mixing'
  quantity: number
  cost: number
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  type: 'charge' | 'refund' | 'topup'
  amount: number
  stripe_payment_id: string | null
  description: string | null
  created_at: string
}
