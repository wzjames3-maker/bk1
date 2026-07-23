import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { matchVoices, type VoiceOption } from '@/lib/services/voice-matcher'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const roles: string[] = body.roles

  if (!Array.isArray(roles) || roles.length === 0) {
    return NextResponse.json({ error: 'roles array required' }, { status: 400 })
  }

  // 获取活跃音色库
  const admin = createAdminClient()
  const { data: voices } = await admin
    .from('voices')
    .select('id, name, gender, style')
    .eq('is_active', true)

  if (!voices || voices.length === 0) {
    return NextResponse.json({ error: 'No voices available' }, { status: 500 })
  }

  const voiceOptions: VoiceOption[] = voices.map(v => ({
    id: v.id,
    name: v.name,
    gender: v.gender as 'male' | 'female',
    style: v.style,
  }))

  const mapping = await matchVoices(roles, voiceOptions)
  return NextResponse.json({ mapping })
}
