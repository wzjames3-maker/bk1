import { createClient } from '@/lib/supabase/server'

export async function uploadMaterial(
  userId: string,
  file: File
): Promise<{ path: string; size: number }> {
  const supabase = await createClient()

  const ext = file.name.split('.').pop() || 'txt'
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabase.storage
    .from('materials')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  // 私有 bucket 不返回 publicUrl，后续 pipeline 用 service role 读取
  return { path: fileName, size: file.size }
}

export async function getSignedUrl(path: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('materials')
    .createSignedUrl(path, 3600)

  if (error) throw new Error(`Signed URL failed: ${error.message}`)
  return data.signedUrl
}
