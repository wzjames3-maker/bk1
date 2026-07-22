import { synthesizeAliyun } from './tts-aliyun'
import { synthesizeMimo } from './tts-mimo'
import { createAdminClient } from '@/lib/supabase/admin'

interface TtsResult {
  audioBuffer: Buffer
  durationMs: number
}

export async function synthesizeSegment(
  text: string,
  voiceDbId: string
): Promise<TtsResult> {
  const supabase = createAdminClient()

  const { data: voice } = await supabase
    .from('voices')
    .select('provider, provider_voice_id')
    .eq('id', voiceDbId)
    .single()

  if (!voice) throw new Error(`Voice not found: ${voiceDbId}`)

  if (voice.provider === 'aliyun') {
    return synthesizeAliyun({ text, voiceId: voice.provider_voice_id })
  }

  if (voice.provider === 'mimo') {
    return synthesizeMimo({ text, voiceId: voice.provider_voice_id })
  }

  throw new Error(`Unknown TTS provider: ${voice.provider}`)
}
