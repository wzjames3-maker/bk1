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

  // Upstash Redis 并发控制：每用户最多 1 个并发 Pipeline
  const { Redis } = await import('@upstash/redis')
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_URL!,
    token: process.env.UPSTASH_REDIS_TOKEN!,
  })
  const lockKey = `pipeline:lock:${userId}`
  const acquired = await redis.set(lockKey, episodeId, { nx: true, ex: 300 })
  if (!acquired) {
    return NextResponse.json({ error: 'Pipeline already running' }, { status: 409 })
  }

  try {
    const result = await advancePipeline(episodeId, userId, step, attempt || 1)

    if (!result.success) {
      // 特殊处理：等待确认不是错误
      if (result.error === 'WAITING_FOR_CONFIRMATION') {
        return NextResponse.json({ status: 'waiting_for_confirmation' })
      }
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ status: 'advanced', step })
  } finally {
    // 释放锁，允许下一步获取
    await redis.del(lockKey)
  }
}
