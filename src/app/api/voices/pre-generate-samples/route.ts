import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { synthesizeMimo } from '@/lib/services/tts-mimo'

const SAMPLE_TEXT = '你好，欢迎收听我们的播客节目，今天我们来聊一个有趣的话题。'

/**
 * 批量预合成所有音色的试听样本
 * 仅内部调用（需 PIPELINE_INTERNAL_SECRET）
 * 部署后执行一次即可，后续新增音色时再调用
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-pipeline-secret') ?? ''
  const expected = process.env.PIPELINE_INTERNAL_SECRET
  if (!expected || secret.length !== expected.length ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  // 查找所有没有 sample_url 的活跃音色
  const { data: voices, error } = await admin
    .from('voices')
    .select('id, name, provider_voice_id, sample_url')
    .eq('is_active', true)
    .is('sample_url', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!voices || voices.length === 0) {
    return NextResponse.json({ message: 'All voices already have samples', generated: 0 })
  }

  const results: Array<{ id: string; name: string; success: boolean; error?: string }> = []

  for (const voice of voices) {
    try {
      const { audioBuffer } = await synthesizeMimo({
        text: SAMPLE_TEXT,
        voiceId: voice.provider_voice_id,
      })

      const path = `voice-samples/${voice.id}.mp3`
      const { error: uploadErr } = await admin.storage
        .from('audio')
        .upload(path, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

      if (uploadErr) throw uploadErr

      const { data: urlData } = admin.storage.from('audio').getPublicUrl(path)
      const sampleUrl = urlData.publicUrl

      await admin.from('voices').update({ sample_url: sampleUrl }).eq('id', voice.id)

      results.push({ id: voice.id, name: voice.name, success: true })
    } catch (e) {
      results.push({ id: voice.id, name: voice.name, success: false, error: (e as Error).message })
    }
  }

  const succeeded = results.filter(r => r.success).length
  return NextResponse.json({
    message: `Generated ${succeeded}/${results.length} voice samples`,
    results,
  })
}
