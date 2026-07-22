import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { createAdminClient } from '@/lib/supabase/admin'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFile, readFile, mkdir, rm } from 'fs/promises'
import { randomUUID } from 'crypto'
import { probeDurationMs } from '@/lib/services/audio-duration'

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

export async function mixEpisode(options: MixOptions): Promise<MixOutput> {
  const { segmentPaths } = options
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
    let durationMs = 0
    try {
      durationMs = await probeDurationMs(outputPath)
    } catch {
      durationMs = Math.round((outputBuffer.length / 16000) * 1000)
    }

    return { audioBuffer: outputBuffer, durationMs }
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
