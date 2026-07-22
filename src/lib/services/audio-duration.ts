import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

export async function probeDurationMs(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err)
        return
      }
      const seconds = metadata.format.duration
      if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
        reject(new Error('Invalid audio duration'))
        return
      }
      resolve(Math.round(seconds * 1000))
    })
  })
}

export async function probeBufferDurationMs(audioBuffer: Buffer, ext = 'mp3'): Promise<number> {
  const workDir = join(tmpdir(), `probe-${randomUUID()}`)
  const filePath = join(workDir, `audio.${ext}`)
  await mkdir(workDir, { recursive: true })
  await writeFile(filePath, audioBuffer)
  try {
    return await probeDurationMs(filePath)
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

export function formatChapterTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function buildChaptersFromSegments(
  segments: Array<{ text: string; durationMs: number; role?: string }>,
  options?: { targetChapterMs?: number; maxChapters?: number }
): Array<{ time: string; title: string }> {
  const targetChapterMs = options?.targetChapterMs ?? 30000
  const maxChapters = options?.maxChapters ?? 12
  if (segments.length === 0) return [{ time: '00:00', title: '开场' }]

  const chapters: Array<{ time: string; title: string }> = []
  let cursorMs = 0
  let chapterStartMs = 0
  let chapterText = ''
  let chapterChars = 0

  const pushChapter = () => {
    const title = chapterText.replace(/\s+/g, ' ').trim().slice(0, 24) || '章节'
    chapters.push({
      time: formatChapterTime(chapterStartMs),
      title: title.length >= 24 ? `${title}…` : title,
    })
  }

  for (const segment of segments) {
    const shouldSplit =
      chapters.length < maxChapters - 1 &&
      chapterChars > 0 &&
      cursorMs - chapterStartMs >= targetChapterMs

    if (shouldSplit) {
      pushChapter()
      chapterStartMs = cursorMs
      chapterText = ''
      chapterChars = 0
    }

    if (!chapterText) {
      chapterText = segment.text || ''
    }
    chapterChars += (segment.text || '').length
    cursorMs += Math.max(0, segment.durationMs || 0)
  }

  if (chapterChars > 0 || chapters.length === 0) {
    pushChapter()
  }

  if (chapters[0]) chapters[0].time = '00:00'
  return chapters
}

/** 将章节时间缩放到真实音频总时长，避免段时长估算偏差导致超界 */
export function scaleChaptersToDuration(
  chapters: Array<{ time: string; title: string }>,
  actualDurationMs: number
): Array<{ time: string; title: string }> {
  if (!chapters.length || !actualDurationMs || actualDurationMs <= 0) return chapters

  const toMs = (time: string) => {
    const parts = time.split(':').map(Number)
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
    return 0
  }

  const lastMs = toMs(chapters[chapters.length - 1].time)
  if (lastMs <= 0 || lastMs <= actualDurationMs) return chapters

  const scale = actualDurationMs / lastMs
  return chapters.map((ch, i) => ({
    title: ch.title,
    time: i === 0 ? '00:00' : formatChapterTime(Math.min(actualDurationMs, Math.round(toMs(ch.time) * scale))),
  }))
}
