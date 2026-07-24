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

  const materials = episode.materials as Array<{
    type: string
    url: string
    text?: string
    name?: string
    content_type?: string
    extracted_text?: string
  }>

  if (!materials || materials.length === 0) return

  const updated = [...materials]

  for (let i = 0; i < updated.length; i++) {
    const mat = updated[i]
    if (mat.extracted_text) continue

    if (mat.type === 'url' && mat.url) {
      const parsed = await parseMaterial({ url: mat.url })
      updated[i] = { ...mat, extracted_text: parsed.text }
    } else if (mat.type === 'text' && mat.text) {
      updated[i] = { ...mat, extracted_text: mat.text }
    } else if (mat.type === 'file' && mat.url) {
      // 从 Storage materials bucket 下载文件并解析
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('materials')
        .download(mat.url)

      if (downloadError || !fileData) {
        console.error(`[parse] Failed to download file ${mat.url}: ${downloadError?.message}`)
        updated[i] = { ...mat, extracted_text: `[文件下载失败: ${mat.name || mat.url}]` }
        continue
      }

      const buffer = Buffer.from(await fileData.arrayBuffer())
      const contentType = mat.content_type || guessContentType(mat.name || mat.url)
      const fileName = mat.name || mat.url.split('/').pop() || 'file'

      try {
        const parsed = await parseMaterial({ buffer, name: fileName, type: contentType })
        updated[i] = { ...mat, extracted_text: parsed.text }
      } catch (parseError) {
        console.error(`[parse] Failed to parse file ${fileName}:`, parseError)
        updated[i] = { ...mat, extracted_text: `[文件解析失败: ${fileName}]` }
      }
    }
  }

  await supabase
    .from('episodes')
    .update({ materials: JSON.stringify(updated) })
    .eq('id', episodeId)
}

/** 根据文件扩展名推断 MIME type */
function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'doc': return 'application/msword'
    case 'txt': return 'text/plain'
    case 'pdf': return 'application/pdf'
    default: return 'text/plain'
  }
}
