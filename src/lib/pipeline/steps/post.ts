import { createAdminClient } from '@/lib/supabase/admin'
import { generatePostContent } from '@/lib/services/post-process'
import type { ScriptSegment } from '@/types/database'
import type { TtsSegmentResult } from '@/types/pipeline'

export async function executePostStep(episodeId: string, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('topic, script, chapters')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const script: ScriptSegment[] = typeof episode.script === 'string'
    ? JSON.parse(episode.script)
    : episode.script

  const segments: TtsSegmentResult[] = typeof episode.chapters === 'string'
    ? JSON.parse(episode.chapters)
    : episode.chapters

  const totalDurationMs = segments?.reduce((sum, s) => sum + s.durationMs, 0) || 0

  const { showNotes, chapters, coverSuggestion } = await generatePostContent(
    episode.topic,
    script,
    totalDurationMs
  )

  await supabase
    .from('episodes')
    .update({
      show_notes: showNotes,
      chapters: JSON.stringify(chapters),
      cover_url: coverSuggestion,  // MVP: 存文字建议，非图片
    })
    .eq('id', episodeId)
}
