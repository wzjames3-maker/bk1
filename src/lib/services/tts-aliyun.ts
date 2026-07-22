import { EXTERNAL_TIMEOUT_MS, MAX_RETRIES } from '@/types/pipeline'
import { probeBufferDurationMs } from '@/lib/services/audio-duration'

interface TtsOptions {
  text: string
  voiceId: string
  speed?: number     // 0.5 - 2.0
  pitch?: number     // 0.5 - 2.0
}

interface TtsResult {
  audioBuffer: Buffer
  durationMs: number
}

export async function synthesizeAliyun(options: TtsOptions): Promise<TtsResult> {
  const { text, voiceId, speed = 1.0, pitch = 1.0 } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS)

      const response = await fetch('https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NLS-Token': process.env.ALIYUN_TTS_ACCESS_KEY!,
        },
        body: JSON.stringify({
          appkey: process.env.ALIYUN_TTS_APP_KEY!,
          text,
          voice: voiceId,
          format: 'mp3',
          speech_rate: Math.round((speed - 1) * 500),   // -500 ~ 500
          pitch_rate: Math.round((pitch - 1) * 500),
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`Aliyun TTS HTTP ${response.status}: ${await response.text()}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = Buffer.from(arrayBuffer)

      if (audioBuffer.length < 100) throw new Error('Aliyun TTS returned empty audio')

      let durationMs = 0
      try {
        durationMs = await probeBufferDurationMs(audioBuffer, 'mp3')
      } catch {
        durationMs = Math.round((audioBuffer.length / 16000) * 1000)
      }

      return { audioBuffer, durationMs }
    } catch (err) {
      lastError = err as Error
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }

  throw new Error(`Aliyun TTS failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}
