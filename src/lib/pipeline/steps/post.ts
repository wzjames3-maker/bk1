import { createAdminClient } from '@/lib/supabase/admin'
import { generatePostContent } from '@/lib/services/post-process'
import { buildChaptersFromSegments, scaleChaptersToDuration } from '@/lib/services/audio-duration'
import type { ScriptSegment } from '@/types/database'
import type { TtsSegmentResult } from '@/types/pipeline'

export async function executePostStep(episodeId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('topic, script, params')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const script: ScriptSegment[] = typeof episode.script === 'string'
    ? JSON.parse(episode.script)
    : episode.script

  const params = (episode.params || {}) as {
    tts_segments?: TtsSegmentResult[]
    audio_duration_ms?: number
  }
  const segments = params.tts_segments || []

  const totalDurationMs =
    params.audio_duration_ms ||
    segments.reduce((sum, s) => sum + (s.durationMs || 0), 0)

  // 章节时间轴按真实 TTS 段时长生成，不再信任 LLM 猜测时间
  const timedSegments = segments.map((seg, i) => ({
    text: script?.[i]?.text || `段落 ${i + 1}`,
    durationMs: seg.durationMs || 0,
    role: script?.[i]?.role,
  }))

  let chapters = buildChaptersFromSegments(timedSegments, {
    targetChapterMs: Math.max(15000, Math.floor((totalDurationMs || 60000) / 8)),
    maxChapters: 12,
  })

  // 有混音后真实总时长时，缩放到音频边界内
  if (params.audio_duration_ms) {
    chapters = scaleChaptersToDuration(chapters, params.audio_duration_ms)
  }

  const { showNotes, coverSuggestion, chapterTitles } = await generatePostContent(
    episode.topic,
    script || [],
    totalDurationMs,
    chapters.length
  )

  // 仅覆盖标题，时间戳保持服务端真实值
  if (chapterTitles && chapterTitles.length > 0) {
    for (let i = 0; i < chapters.length; i++) {
      const title = chapterTitles[i]
      if (title) chapters[i].title = title.slice(0, 24)
    }
  }

  await supabase
    .from('episodes')
    .update({
      show_notes: showNotes,
      chapters: JSON.stringify(chapters),
      cover_url: coverSuggestion,
    })
    .eq('id', episodeId)
}
