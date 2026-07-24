import { createAdminClient } from '@/lib/supabase/admin'
import { synthesizeSegment } from '@/lib/services/tts-router'
import { getTtsInstruction } from '@/lib/services/style-presets'
import type { ScriptSegment } from '@/types/database'
import type { TtsSegmentResult } from '@/types/pipeline'

export async function executeTtsStep(episodeId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('script, params, preview_url')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const script: ScriptSegment[] = typeof episode.script === 'string'
    ? JSON.parse(episode.script)
    : episode.script

  if (!script || script.length === 0) throw new Error('No script found')

  const params = episode.params as { voice_ids: string[]; roles_count: number; style?: string }
  const voiceIds = params.voice_ids || []
  const styleInstruction = getTtsInstruction(params.style || 'casual')

  // 角色名 → voice_id 映射（按出场顺序分配）
  const roleNames = [...new Set(script.map(s => s.role))]
  const roleToVoice: Record<string, string> = {}
  roleNames.forEach((name, i) => {
    roleToVoice[name] = voiceIds[i % voiceIds.length] || voiceIds[0]
  })

  const results: TtsSegmentResult[] = []
  let totalChars = 0

  // 逐段合成
  for (let i = 0; i < script.length; i++) {
    const segment = script[i]
    const voiceId = roleToVoice[segment.role]

    if (!voiceId) throw new Error(`No voice assigned to role: ${segment.role}`)

    const { audioBuffer, durationMs } = await synthesizeSegment(segment.text, voiceId, styleInstruction)

    // 上传到 Supabase Storage
    const path = `${userId}/episodes/${episodeId}/segment-${String(i).padStart(3, '0')}.mp3`
    const { error: uploadError } = await supabase.storage
      .from('audio')
      .upload(path, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadError) throw new Error(`Failed to upload segment ${i}: ${uploadError.message}`)

    results.push({ index: i, audioPath: path, durationMs, charCount: segment.text.length })
    totalChars += segment.text.length
  }

  // 生成 30s 试听样本（前 3 段拼接）
  if (episode.preview_url === 'pending' && results.length >= 1) {
    const previewSegments = results.slice(0, 3)
    const previewPath = `${userId}/episodes/${episodeId}/preview.mp3`

    // 用 FFmpeg 拼接前 3 段为 preview
    const { mixEpisode } = await import('@/lib/services/ffmpeg')
    const { audioBuffer: previewBuffer } = await mixEpisode({
      segmentPaths: previewSegments.map(r => r.audioPath),
      bgmType: 'none',
      userId,
      episodeId,
    })

    await supabase.storage
      .from('audio')
      .upload(previewPath, previewBuffer, { contentType: 'audio/mpeg', upsert: true })

    const { data: { publicUrl } } = supabase.storage
      .from('audio')
      .getPublicUrl(previewPath)

    await supabase.from('episodes').update({ preview_url: publicUrl }).eq('id', episodeId)
  }

  // 保存段落结果到独立 tts_segments 列（供 mix/post 读取）
  await supabase
    .from('episodes')
    .update({ tts_segments: results })
    .eq('id', episodeId)

  // 记录 TTS 用量
  const ttsCost = (totalChars / 1000) * 0.015
  await supabase.from('usage_logs').insert({
    user_id: userId,
    episode_id: episodeId,
    type: 'tts_char',
    quantity: totalChars,
    cost: ttsCost,
  })
}
