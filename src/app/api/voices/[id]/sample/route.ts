import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 获取音色试听样本 URL（仅返回预合成缓存，不现场合成）
 * 试听样本应通过 /api/voices/pre-generate-samples 提前批量生成
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: voice } = await admin
    .from('voices')
    .select('sample_url')
    .eq('id', id)
    .single()

  if (!voice) return NextResponse.json({ error: '音色不存在' }, { status: 404 })

  if (!voice.sample_url) {
    return NextResponse.json({ error: '试听样本尚未生成，请联系管理员' }, { status: 404 })
  }

  return NextResponse.json({ sample_url: voice.sample_url })
}
