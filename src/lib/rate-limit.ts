import { Redis } from '@upstash/redis'

let redis: Redis | null = null

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_URL
  const token = process.env.UPSTASH_REDIS_TOKEN
  if (!url || !token || url.includes('placeholder')) return null
  if (!redis) {
    redis = new Redis({ url, token })
  }
  return redis
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
}

/**
 * 滑动窗口限流
 * @param key - 唯一标识（通常为 userId 或 IP）
 * @param limit - 窗口内最大请求数
 * @param windowMs - 窗口大小（毫秒）
 */
export async function rateLimit(
  key: string,
  limit: number = 30,
  windowMs: number = 60_000
): Promise<RateLimitResult> {
  const client = getRedis()

  // Redis 不可用时放行（开发环境）
  if (!client) {
    return { allowed: true, remaining: limit, resetMs: windowMs }
  }

  try {
    const now = Date.now()
    const windowStart = now - windowMs
    const redisKey = `ratelimit:${key}`

    // 移除窗口外的旧记录
    await client.zremrangebyscore(redisKey, 0, windowStart)

    // 当前窗口内的请求数
    const count = await client.zcard(redisKey)

    if (count >= limit) {
      const oldest = await client.zrange(redisKey, 0, 0, { withScores: true })
      const oldestScore = oldest.length >= 2 ? Number(oldest[1]) : now
      const resetMs = oldestScore + windowMs - now
      return { allowed: false, remaining: 0, resetMs: Math.max(resetMs, 1000) }
    }

    // 添加当前请求
    await client.zadd(redisKey, { score: now, member: `${now}-${Math.random()}` })
    await client.expire(redisKey, Math.ceil(windowMs / 1000) + 1)

    return { allowed: true, remaining: limit - count - 1, resetMs: windowMs }
  } catch (err) {
    // Redis 瞬时故障时 fail-open，不影响 API 可用性
    console.error('[rate-limit] Redis error, failing open:', err)
    return { allowed: true, remaining: limit, resetMs: windowMs }
  }
}
