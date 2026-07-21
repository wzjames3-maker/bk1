import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { createAdminClient } from '@/lib/supabase/admin'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFile, unlink, readFile, mkdir } from 'fs/promises'
import { randomUUID } from 'crypto'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

interface MixOptions {
  segmentPaths: string[]     // Storage paths for each segment
  bgmType: string            // 'none' | 'light' | 'calm' | 'tech'
  userId: string
  episodeId: string
}

interface MixOutput {
  audioBuffer: Buffer
  durationMs: number
}

// BGM 文件映射（后续可替换为实际 BGM 文件 URL）
const BGM_MAP: Record<string, string | null> = {
  none: null,
  light: null,   // MVP: 暂无实际 BGM 文件，仅做拼接
  calm: null,
  tech: null,
}

export async function mixEpisode(options: MixOptions): Promise<MixOutput> {
  const { segmentPaths, bgmType, userId, episodeId } = options
  const supabase = createAdminClient()
  const workDir = join(tmpdir(), `podcast-${randomUUID()}`)
  const localFiles: string[] = []

  try {
    // 创建临时工作目录
    await mkdir(workDir, { recursive: true })

    // 下载所有段落到临时目录
    for (let i = 0; i < segmentPaths.length; i++) {
      const { data, error } = await supabase.storage
        .from('audio')
        .download(segmentPaths[i])

      if (error || !data) throw new Error(`Failed to download segment ${i}: ${error?.message}`)

      const buffer = Buffer.from(await data.arrayBuffer())
      const localPath = join(workDir, `seg-${String(i).padStart(3, '0')}.mp3`)
      localFiles.push(localPath)
      await writeFile(localPath, buffer)
    }

    // 生成 concat 文件列表
    const concatList = localFiles.map(f => `file '${f}'`).join('\n')
    const concatPath = join(workDir, 'concat.txt')
    await writeFile(concatPath, concatList)

    // FFmpeg 拼接
    const outputPath = join(workDir, 'output.mp3')

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
        .run()
    })

    const outputBuffer = await readFile(outputPath)
    const durationMs = Math.round((outputBuffer.length / 16000) * 1000)

    return { audioBuffer: outputBuffer, durationMs }
  } finally {
    // 清理临时文件
    for (const f of localFiles) {
      await unlink(f).catch(() => {})
    }
  }
}
