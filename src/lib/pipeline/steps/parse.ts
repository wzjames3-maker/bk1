import { createAdminClient } from '@/lib/supabase/admin'
import { parseMaterial } from '@/lib/services/parser'

export async function executeParseStep(episodeId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('materials')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const materials = episode.materials as Array<{ type: string; url: string; text?: string; extracted_text?: string }>

  if (!materials || materials.length === 0) return  // 无素材，跳过

  const updated = [...materials]

  for (let i = 0; i < updated.length; i++) {
    const mat = updated[i]
    if (mat.extracted_text) continue  // 已解析

    if (mat.type === 'url' && mat.url) {
      const parsed = await parseMaterial({ url: mat.url })
      updated[i] = { ...mat, extracted_text: parsed.text }
    } else if (mat.type === 'text' && mat.text) {
      updated[i] = { ...mat, extracted_text: mat.text }
    }
    // file 类型：MVP 暂不支持从 Storage 下载后解析（需要 service role 读取）
    // 后续迭代补充
  }

  await supabase
    .from('episodes')
    .update({ materials: JSON.stringify(updated) })
    .eq('id', episodeId)
}
