import { createAdminClient } from '@/lib/supabase/admin'
import { mixEpisode } from '@/lib/services/ffmpeg'
import type { TtsSegmentResult } from '@/types/pipeline'

export async function executeMixStep(episodeId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('params, tts_segments')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const params = episode.params as { bgm?: string }
  // 优先读独立列，向后兼容旧数据 params.tts_segments
  const segments: TtsSegmentResult[] =
    (episode.tts_segments as TtsSegmentResult[] | null) ||
    (params as Record<string, unknown>).tts_segments as TtsSegmentResult[] ||
    []
  if (!segments.length) throw new Error('No TTS segments found')

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

  // 更新 episode，并回写真实总时长供章节对齐
  await supabase
    .from('episodes')
    .update({
      audio_url: publicUrl,
      params: {
        ...params,
        audio_duration_ms: durationMs,
      },
    })
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
