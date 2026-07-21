import { EXTERNAL_TIMEOUT_MS, MAX_RETRIES } from '@/types/pipeline'

interface TtsOptions {
  text: string
  voiceId: string
  speed?: number
}

interface TtsResult {
  audioBuffer: Buffer
  durationMs: number
}

export async function synthesizeMimo(options: TtsOptions): Promise<TtsResult> {
  const { text, voiceId, speed = 1.0 } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS)

      const baseUrl = process.env.MIMO_BASE_URL || 'https://api.mimo.audio'
      const response = await fetch(`${baseUrl}/v1/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.MIMO_API_KEY!}`,
        },
        body: JSON.stringify({
          model: 'mimo-tts',
          input: text,
          voice: voiceId,
          speed,
          response_format: 'mp3',
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`MiMo TTS HTTP ${response.status}: ${await response.text()}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const audioBuffer = Buffer.from(arrayBuffer)

      if (audioBuffer.length < 100) throw new Error('MiMo TTS returned empty audio')

      const durationMs = Math.round((audioBuffer.length / 16000) * 1000)

      return { audioBuffer, durationMs }
    } catch (err) {
      lastError = err as Error
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }

  throw new Error(`MiMo TTS failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}
