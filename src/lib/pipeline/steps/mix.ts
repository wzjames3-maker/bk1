import { createAdminClient } from '@/lib/supabase/admin'
import { mixEpisode } from '@/lib/services/ffmpeg'
import type { TtsSegmentResult } from '@/types/pipeline'

export async function executeMixStep(episodeId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('chapters, params')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const segments: TtsSegmentResult[] = typeof episode.chapters === 'string'
    ? JSON.parse(episode.chapters)
    : episode.chapters

  if (!segments || segments.length === 0) throw new Error('No TTS segments found')

  const params = episode.params as { bgm?: string }
  const bgmType = params.bgm || 'none'

  const segmentPaths = segments.map(s => s.audioPath)

  const { audioBuffer, durationMs } = await mixEpisode({
    segmentPaths,
    bgmType,
    userId,
    episodeId,
  })

  // 上传最终音频
  const outputPath = `${userId}/episodes/${episodeId}/final.mp3`
  const { error: uploadError } = await supabase.storage
    .from('audio')
    .upload(outputPath, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

  if (uploadError) throw new Error(`Failed to upload final audio: ${uploadError.message}`)

  const { data: { publicUrl } } = supabase.storage
    .from('audio')
    .getPublicUrl(outputPath)

  // 更新 episode
  await supabase
    .from('episodes')
    .update({ audio_url: publicUrl })
    .eq('id', episodeId)

  // 记录混音用量
  await supabase.from('usage_logs').insert({
    user_id: userId,
    episode_id: episodeId,
    type: 'mixing',
    quantity: 1,
    cost: 0.01,
  })
}
