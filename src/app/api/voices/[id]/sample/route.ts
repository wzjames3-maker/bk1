import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { synthesizeMimo } from '@/lib/services/tts-mimo'

const SAMPLE_TEXT = '你好，欢迎收听我们的播客节目，今天我们来聊一个有趣的话题。'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: voice } = await admin
    .from('voices')
    .select('*')
    .eq('id', id)
    .single()

  if (!voice) return NextResponse.json({ error: '音色不存在' }, { status: 404 })

  if (voice.sample_url) {
    return NextResponse.json({ sample_url: voice.sample_url })
  }

  try {
    const { audioBuffer } = await synthesizeMimo({
      text: SAMPLE_TEXT,
      voiceId: voice.provider_voice_id,
    })

    const path = `voice-samples/${voice.id}.mp3`
    const { error: uploadErr } = await admin.storage
      .from('podcast-audio')
      .upload(path, audioBuffer, { contentType: 'audio/mpeg', upsert: true })

    if (uploadErr) throw uploadErr

    const { data: urlData } = admin.storage.from('podcast-audio').getPublicUrl(path)
    const sampleUrl = urlData.publicUrl

    await admin.from('voices').update({ sample_url: sampleUrl }).eq('id', voice.id)

    return NextResponse.json({ sample_url: sampleUrl })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
