import { EXTERNAL_TIMEOUT_MS, MAX_RETRIES } from '@/types/pipeline'
import { probeBufferDurationMs } from '@/lib/services/audio-duration'

interface TtsOptions {
  text: string
  voiceId: string
  speed?: number
  styleInstruction?: string
}

interface TtsResult {
  audioBuffer: Buffer
  durationMs: number
}

interface MimoTtsResponse {
  choices?: Array<{
    message?: {
      audio?: {
        data?: string
        id?: string
        expires_at?: number
      }
      content?: string | null
    }
  }>
  error?: {
    message?: string
    code?: string | number
    type?: string
  }
}

function getBaseUrl() {
  return (process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1').replace(/\/$/, '')
}

function getModel() {
  return process.env.MIMO_TTS_MODEL || 'mimo-v2.5-tts'
}

async function resolveDurationMs(audioBuffer: Buffer, format: string) {
  try {
    return await probeBufferDurationMs(audioBuffer, format === 'wav' ? 'wav' : 'mp3')
  } catch {
    if (format === 'wav' && audioBuffer.length > 44) {
      const dataSize = audioBuffer.readUInt32LE(40)
      if (dataSize > 0) {
        return Math.round((dataSize / (24000 * 2)) * 1000)
      }
    }
    return Math.max(500, Math.round((audioBuffer.length / 2000) * 1000))
  }
}

function buildMessages(
  model: string,
  text: string,
  voiceId: string,
  styleInstruction?: string
): Array<{ role: string; content: string }> {
  const isVoiceDesign = model.includes('voicedesign')

  if (isVoiceDesign) {
    return [
      { role: 'user', content: styleInstruction || voiceId },
      { role: 'assistant', content: text },
    ]
  }

  const messages: Array<{ role: string; content: string }> = []
  if (styleInstruction) {
    messages.push({ role: 'user', content: styleInstruction })
  }
  messages.push({ role: 'assistant', content: text })
  return messages
}

export async function synthesizeMimo(options: TtsOptions): Promise<TtsResult> {
  const { text, voiceId, styleInstruction } = options

  const baseUrl = getBaseUrl()
  const model = getModel()
  const format = process.env.MIMO_TTS_FORMAT || 'mp3'
  const isVoiceDesign = model.includes('voicedesign')
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), Math.max(EXTERNAL_TIMEOUT_MS, 120000))

      const body = {
        model,
        messages: buildMessages(model, text, voiceId, styleInstruction),
        audio: isVoiceDesign
          ? { format }
          : { format, voice: voiceId || 'mimo_default' },
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.MIMO_API_KEY!}`,
          'api-key': process.env.MIMO_API_KEY!,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      const contentType = response.headers.get('content-type') || ''
      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`MiMo TTS HTTP ${response.status}: ${errText.slice(0, 300)}`)
      }

      if (!contentType.includes('json')) {
        const arrayBuffer = await response.arrayBuffer()
        const audioBuffer = Buffer.from(arrayBuffer)
        if (audioBuffer.length < 100) throw new Error('MiMo TTS returned empty audio')
        return {
          audioBuffer,
          durationMs: await resolveDurationMs(audioBuffer, format),
        }
      }

      const data = (await response.json()) as MimoTtsResponse
      if (data.error?.message) {
        throw new Error(`MiMo TTS error: ${data.error.message}`)
      }

      const audioB64 = data.choices?.[0]?.message?.audio?.data
      if (!audioB64) {
        throw new Error('MiMo TTS response missing audio.data')
      }

      const audioBuffer = Buffer.from(audioB64, 'base64')
      if (audioBuffer.length < 100) throw new Error('MiMo TTS returned empty audio')

      return {
        audioBuffer,
        durationMs: await resolveDurationMs(audioBuffer, format),
      }
    } catch (err) {
      lastError = err as Error
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }

  throw new Error(`MiMo TTS failed after ${MAX_RETRIES} attempts: ${lastError?.message}`)
}
