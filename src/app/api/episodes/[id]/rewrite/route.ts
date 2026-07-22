import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rewriteScript, rewriteSegment } from '@/lib/services/deepseek'
import { hasRewriteLock } from '@/lib/services/episode-rewrite-guard'
import type { ScriptSegment } from '@/types/database'
import { randomUUID } from 'node:crypto'

const REWRITE_LIMIT = 3
const LLM_PER_1K = 0.002

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const mode = body.mode as string
  if (mode !== 'polish' && mode !== 'segment') {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }

  let segmentIndex: number | undefined
  if (mode === 'segment') {
    segmentIndex = Number(body.segmentIndex)
    if (!Number.isInteger(segmentIndex)) {
      return NextResponse.json({ error: 'segmentIndex required' }, { status: 400 })
    }
  }

  const { data: episode } = await supabase
    .from('episodes')
    .select('id, status, topic, script, params')
    .eq('id', id)
    .single()

  if (!episode) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (episode.status !== 'script_ready') {
    return NextResponse.json(
      { error: `Cannot rewrite in status: ${episode.status}` },
      { status: 400 }
    )
  }

  const currentParams = (episode.params || {}) as Record<string, unknown>
  if (Number(currentParams.rewrite_count || 0) >= REWRITE_LIMIT) {
    return NextResponse.json(
      { error: `本集 AI 改稿次数已用完（${REWRITE_LIMIT}/${REWRITE_LIMIT}），请手动编辑` },
      { status: 429 }
    )
  }
  if (hasRewriteLock(currentParams)) {
    return NextResponse.json({ error: 'Rewrite already in progress' }, { status: 409 })
  }

  const script: ScriptSegment[] =
    typeof episode.script === 'string'
      ? JSON.parse(episode.script)
      : episode.script || []

  if (!script.length) {
    return NextResponse.json({ error: 'Empty script' }, { status: 400 })
  }
  if (mode === 'segment' && (segmentIndex! < 0 || segmentIndex! >= script.length)) {
    return NextResponse.json({ error: 'segmentIndex out of range' }, { status: 400 })
  }

  const lockToken = randomUUID()
  const { data: claimed, error: claimError } = await supabase.rpc('claim_episode_rewrite', {
    p_episode_id: id,
    p_lock_token: lockToken,
  })
  if (claimError) {
    return NextResponse.json({ error: `Unable to claim rewrite: ${claimError.message}` }, { status: 500 })
  }
  if (!claimed) {
    return NextResponse.json({ error: 'Rewrite is unavailable because this episode changed' }, { status: 409 })
  }

  const claimedEpisode = claimed as {
    topic: string
    script: ScriptSegment[] | string | null
    params: Record<string, unknown>
  }
  const claimedScript: ScriptSegment[] = typeof claimedEpisode.script === 'string'
    ? JSON.parse(claimedEpisode.script)
    : claimedEpisode.script || []

  if (!claimedScript.length || (mode === 'segment' && (segmentIndex! < 0 || segmentIndex! >= claimedScript.length))) {
    await supabase.rpc('release_episode_rewrite_lock', {
      p_episode_id: id,
      p_lock_token: lockToken,
    })
    return NextResponse.json({ error: 'Script changed before rewrite started' }, { status: 409 })
  }

  try {
    const style = String(claimedEpisode.params?.style || 'casual')
    const instruction =
      typeof body.instruction === 'string' ? body.instruction : undefined

    let result: { segments: ScriptSegment[]; tokenUsage: { prompt: number; completion: number } }

    if (mode === 'polish') {
      result = await rewriteScript({
        topic: claimedEpisode.topic,
        style,
        segments: claimedScript,
        instruction,
      })
    } else {
      result = await rewriteSegment({
        topic: claimedEpisode.topic,
        style,
        segments: claimedScript,
        segmentIndex: segmentIndex!,
        instruction,
      })
    }

    const totalTokens = result.tokenUsage.prompt + result.tokenUsage.completion
    const cost = (totalTokens / 1000) * LLM_PER_1K
    const { data: completed, error: completeError } = await supabase.rpc('complete_episode_rewrite', {
      p_episode_id: id,
      p_lock_token: lockToken,
      p_script: result.segments,
      p_token_quantity: totalTokens,
      p_cost: cost,
    })
    if (completeError) throw new Error(completeError.message)
    if (!completed) throw new Error('Episode changed before rewrite could be saved')

    return NextResponse.json({
      script: completed.script,
      rewrite_count: completed.rewrite_count,
      rewrite_limit: REWRITE_LIMIT,
    })
  } catch (err) {
    await supabase.rpc('release_episode_rewrite_lock', {
      p_episode_id: id,
      p_lock_token: lockToken,
    })

    return NextResponse.json(
      { error: (err as Error).message || 'Rewrite failed' },
      { status: 502 }
    )
  }
}
