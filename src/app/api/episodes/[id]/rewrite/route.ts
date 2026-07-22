import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rewriteScript, rewriteSegment } from '@/lib/services/deepseek'
import type { ScriptSegment } from '@/types/database'

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
    .select('id, user_id, status, topic, script, params')
    .eq('id', id)
    .single()

  if (!episode || episode.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (episode.status !== 'script_ready') {
    return NextResponse.json(
      { error: `Cannot rewrite in status: ${episode.status}` },
      { status: 400 }
    )
  }

  const paramsObj = (episode.params || {}) as Record<string, unknown>
  const rewriteCount = Number(paramsObj.rewrite_count || 0)
  if (rewriteCount >= REWRITE_LIMIT) {
    return NextResponse.json(
      { error: `本集 AI 改稿次数已用完（${REWRITE_LIMIT}/${REWRITE_LIMIT}），请手动编辑` },
      { status: 429 }
    )
  }
  if (paramsObj.rewrite_in_progress === true) {
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

  await supabase
    .from('episodes')
    .update({
      params: { ...paramsObj, rewrite_in_progress: true },
    })
    .eq('id', id)
    .eq('user_id', user.id)

  try {
    const style = String(paramsObj.style || 'casual')
    const instruction =
      typeof body.instruction === 'string' ? body.instruction : undefined

    let result: { segments: ScriptSegment[]; tokenUsage: { prompt: number; completion: number } }

    if (mode === 'polish') {
      result = await rewriteScript({
        topic: episode.topic,
        style,
        segments: script,
        instruction,
      })
    } else {
      result = await rewriteSegment({
        topic: episode.topic,
        style,
        segments: script,
        segmentIndex: segmentIndex!,
        instruction,
      })
    }

    const { data: fresh } = await supabase
      .from('episodes')
      .select('params')
      .eq('id', id)
      .single()
    const freshParams = (fresh?.params || paramsObj) as Record<string, unknown>
    const nextCount = rewriteCount + 1
    const nextParams = {
      ...freshParams,
      rewrite_count: nextCount,
      rewrite_in_progress: false,
    }

    const { error: upErr } = await supabase
      .from('episodes')
      .update({
        script: result.segments,
        params: nextParams,
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (upErr) throw new Error(upErr.message)

    const totalTokens = result.tokenUsage.prompt + result.tokenUsage.completion
    const cost = (totalTokens / 1000) * LLM_PER_1K
    await supabase.from('usage_logs').insert({
      user_id: user.id,
      episode_id: id,
      type: 'llm_token',
      quantity: totalTokens,
      cost,
    })

    return NextResponse.json({
      script: result.segments,
      rewrite_count: nextCount,
      rewrite_limit: REWRITE_LIMIT,
    })
  } catch (err) {
    const { data: fresh } = await supabase
      .from('episodes')
      .select('params')
      .eq('id', id)
      .single()
    const freshParams = (fresh?.params || paramsObj) as Record<string, unknown>
    await supabase
      .from('episodes')
      .update({
        params: { ...freshParams, rewrite_in_progress: false },
      })
      .eq('id', id)
      .eq('user_id', user.id)

    return NextResponse.json(
      { error: (err as Error).message || 'Rewrite failed' },
      { status: 502 }
    )
  }
}
