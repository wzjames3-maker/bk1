import { NextRequest, NextResponse } from 'next/server'
import { advancePipeline, registerStep } from '@/lib/pipeline/orchestrator'
import { executeParseStep } from '@/lib/pipeline/steps/parse'
import { executeScriptStep } from '@/lib/pipeline/steps/script'
import { executeConfirmStep } from '@/lib/pipeline/steps/confirm'
import { executeTtsStep } from '@/lib/pipeline/steps/tts'
import { executeMixStep } from '@/lib/pipeline/steps/mix'
import { executePostStep } from '@/lib/pipeline/steps/post'
import type { PipelineStep } from '@/types/pipeline'

// 注册所有步骤执行器
registerStep('parsing', executeParseStep)
registerStep('scripting', executeScriptStep)
registerStep('confirming', executeConfirmStep)
registerStep('tts_processing', executeTtsStep)
registerStep('mixing', executeMixStep)
registerStep('post_processing', executePostStep)

function isPlaceholder(value?: string | null) {
  if (!value) return true
  return /^(your-|YOUR_|placeholder|change-in-production)/i.test(value)
}

async function triggerNextStep(payload: {
  episodeId: string
  userId: string
  step: PipelineStep
  attempt?: number
}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const body = JSON.stringify({
    episodeId: payload.episodeId,
    userId: payload.userId,
    step: payload.step,
    attempt: payload.attempt || 1,
  })

  let lastError: unknown = null
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/pipeline/advance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
        },
        body,
      })
      if (res.ok || res.status === 409) return
      lastError = new Error(`advance HTTP ${res.status}: ${await res.text()}`)
    } catch (err) {
      lastError = err
    }
    await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)))
  }
  console.error('[pipeline] failed to trigger next step', {
    episodeId: payload.episodeId,
    step: payload.step,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  })
}

export async function POST(request: NextRequest) {
  // 内部调用鉴权
  const secret = request.headers.get('x-pipeline-secret')
  if (secret !== process.env.PIPELINE_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { episodeId, userId, step, attempt } = body as {
    episodeId: string
    userId: string
    step: PipelineStep
    attempt?: number
  }

  if (!episodeId || !userId || !step) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const redisUrl = process.env.UPSTASH_REDIS_URL
  const redisToken = process.env.UPSTASH_REDIS_TOKEN
  const redisEnabled = !isPlaceholder(redisUrl) && !isPlaceholder(redisToken)

  // 生产环境必须启用 Redis 并发锁，避免同用户并发 pipeline
  if (!redisEnabled && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'UPSTASH_REDIS_URL/TOKEN required in production' },
      { status: 500 }
    )
  }

  const lockKey = `pipeline:lock:${userId}`
  let releaseLock: (() => Promise<void>) | null = null

  if (redisEnabled) {
    const { Redis } = await import('@upstash/redis')
    const redis = new Redis({ url: redisUrl!, token: redisToken! })
    const acquired = await redis.set(lockKey, episodeId, { nx: true, ex: 300 })
    if (!acquired) {
      return NextResponse.json({ error: 'Pipeline already running' }, { status: 409 })
    }
    releaseLock = async () => {
      await redis.del(lockKey)
    }
  }

  let result: { success: boolean; error?: string; nextStep?: PipelineStep | null }

  try {
    result = await advancePipeline(episodeId, userId, step, attempt || 1)
  } finally {
    if (releaseLock) {
      await releaseLock()
    }
  }

  // 锁已释放，安全触发下一步（带重试与错误日志）
  if (result.success && result.nextStep) {
    void triggerNextStep({
      episodeId,
      userId,
      step: result.nextStep,
      attempt: 1,
    })
  }

  if (!result.success) {
    if (result.error === 'WAITING_FOR_CONFIRMATION') {
      return NextResponse.json({ status: 'waiting_for_confirmation' })
    }
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ status: 'advanced', step })
}
