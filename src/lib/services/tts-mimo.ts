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
  // 预置精品音色走 mimo-v2.5-tts；voicedesign 用于文本设计音色
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

export async function synthesizeMimo(options: TtsOptions): Promise<TtsResult> {
  const {
    text,
    voiceId,
    styleInstruction = '自然口语、清晰、适合播客对谈，语速适中。',
  } = options

  const baseUrl = getBaseUrl()
  const model = getModel()
  const format = process.env.MIMO_TTS_FORMAT || 'mp3'
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), Math.max(EXTERNAL_TIMEOUT_MS, 120000))

      // 官方约定：
      // - 合成文本必须放在 assistant
      // - user 放风格指令（voicedesign 时则为音色描述）
      // - audio.voice 放预置音色 ID（如 冰糖 / 茉莉 / mimo_default）
      const isVoiceDesign = model.includes('voicedesign')
      const body = {
        model,
        messages: [
          {
            role: 'user',
            content: isVoiceDesign
              ? (styleInstruction || `使用音色：${voiceId}`)
              : styleInstruction,
          },
          {
            role: 'assistant',
            content: text,
          },
        ],
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
