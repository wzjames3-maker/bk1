# P2 安全与稳定性（Rate Limiting + 文件解析）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 API 层添加基于 Upstash Redis 的滑动窗口限流，并让 pipeline 解析步骤真正支持 .docx/.txt 文件内容提取。

**架构：** Rate Limiting 在 Next.js middleware 层（`src/proxy.ts`）拦截 `/api/*` 请求，使用 Upstash Redis 滑动窗口计数（30 次/分钟/用户）。文件解析在 pipeline parse step 中用 admin client 从 Storage `materials` bucket 下载文件，调用已有 `parseMaterial()` 提取文本。Sentry 错误监控已完整配置（仅需 DSN 环境变量激活），无需额外开发。

**技术栈：** @upstash/redis（已安装）、Next.js Middleware、Supabase Storage Admin、mammoth（.docx）、已有 parser.ts

---

## 文件结构

| 操作 | 路径 | 职责 |
|------|------|------|
| 创建 | `src/lib/rate-limit.ts` | 滑动窗口限流工具函数 |
| 修改 | `src/proxy.ts` | middleware 集成限流（/api/* 路由） |
| 修改 | `src/lib/pipeline/steps/parse.ts` | 支持 file 类型素材：从 Storage 下载 + 解析 |
| 修改 | `src/app/api/upload/route.ts` | 上传响应增加 mime type 信息供后续解析使用 |

---

### 任务 1：Rate Limit 工具函数

**文件：**
- 创建：`src/lib/rate-limit.ts`

- [ ] **步骤 1：创建限流工具**

```typescript
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

  const now = Date.now()
  const windowStart = now - windowMs
  const redisKey = `ratelimit:${key}`

  // 移除窗口外的旧记录
  await client.zremrangebyscore(redisKey, 0, windowStart)

  // 当前窗口内的请求数
  const count = await client.zcard(redisKey)

  if (count >= limit) {
    // 获取最早的记录计算重置时间
    const oldest = await client.zrange(redisKey, 0, 0, { withScores: true })
    const oldestScore = oldest.length >= 2 ? Number(oldest[1]) : now
    const resetMs = oldestScore + windowMs - now
    return { allowed: false, remaining: 0, resetMs: Math.max(resetMs, 1000) }
  }

  // 添加当前请求
  await client.zadd(redisKey, { score: now, member: `${now}-${Math.random()}` })
  await client.expire(redisKey, Math.ceil(windowMs / 1000) + 1)

  return { allowed: true, remaining: limit - count - 1, resetMs: windowMs }
}
```

- [ ] **步骤 2：验证类型检查**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/lib/rate-limit.ts
git commit -m "feat: add sliding window rate limiter utility"
```

---

### 任务 2：Middleware 集成限流

**文件：**
- 修改：`src/proxy.ts`

- [ ] **步骤 1：在 middleware 中对 /api/ 路由添加限流**

将 `src/proxy.ts` 替换为：

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { rateLimit } from '@/lib/rate-limit'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 仅对 /api/ 路由限流（排除内部 pipeline 调用）
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/pipeline/')) {
    // 识别用户：优先用 cookie 中的 supabase auth token，否则用 IP
    const authCookie = request.cookies.get('sb-jsvlhnrlgmbcozqncbyo-auth-token')
    const identifier = authCookie?.value?.slice(0, 64) || request.headers.get('x-forwarded-for') || 'anonymous'

    const result = await rateLimit(`api:${identifier}`, 30, 60_000)

    if (!result.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(result.resetMs / 1000)),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **步骤 2：验证类型检查**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/proxy.ts
git commit -m "feat: integrate rate limiting into middleware for /api routes"
```

---

### 任务 3：Pipeline Parse Step 支持文件解析

**文件：**
- 修改：`src/lib/pipeline/steps/parse.ts`

- [ ] **步骤 1：增强 parse step 支持 file 类型素材**

将 `src/lib/pipeline/steps/parse.ts` 替换为：

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { parseMaterial } from '@/lib/services/parser'

export async function executeParseStep(episodeId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: episode } = await supabase
    .from('episodes')
    .select('materials')
    .eq('id', episodeId)
    .single()

  if (!episode) throw new Error('Episode not found')

  const materials = episode.materials as Array<{
    type: string
    url: string
    text?: string
    name?: string
    content_type?: string
    extracted_text?: string
  }>

  if (!materials || materials.length === 0) return

  const updated = [...materials]

  for (let i = 0; i < updated.length; i++) {
    const mat = updated[i]
    if (mat.extracted_text) continue

    if (mat.type === 'url' && mat.url) {
      const parsed = await parseMaterial({ url: mat.url })
      updated[i] = { ...mat, extracted_text: parsed.text }
    } else if (mat.type === 'text' && mat.text) {
      updated[i] = { ...mat, extracted_text: mat.text }
    } else if (mat.type === 'file' && mat.url) {
      // 从 Storage materials bucket 下载文件并解析
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('materials')
        .download(mat.url)

      if (downloadError || !fileData) {
        console.error(`[parse] Failed to download file ${mat.url}: ${downloadError?.message}`)
        updated[i] = { ...mat, extracted_text: `[文件下载失败: ${mat.name || mat.url}]` }
        continue
      }

      const buffer = Buffer.from(await fileData.arrayBuffer())
      const contentType = mat.content_type || guessContentType(mat.name || mat.url)
      const fileName = mat.name || mat.url.split('/').pop() || 'file'

      try {
        const parsed = await parseMaterial({ buffer, name: fileName, type: contentType })
        updated[i] = { ...mat, extracted_text: parsed.text }
      } catch (parseError) {
        console.error(`[parse] Failed to parse file ${fileName}:`, parseError)
        updated[i] = { ...mat, extracted_text: `[文件解析失败: ${fileName}]` }
      }
    }
  }

  await supabase
    .from('episodes')
    .update({ materials: JSON.stringify(updated) })
    .eq('id', episodeId)
}

/** 根据文件扩展名推断 MIME type */
function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'doc': return 'application/msword'
    case 'txt': return 'text/plain'
    case 'pdf': return 'application/pdf'
    default: return 'text/plain'
  }
}
```

- [ ] **步骤 2：验证类型检查**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/lib/pipeline/steps/parse.ts
git commit -m "feat(pipeline): support .docx/.txt file parsing in parse step"
```

---

### 任务 4：上传 API 返回 content_type

**文件：**
- 修改：`src/app/api/upload/route.ts`

- [ ] **步骤 1：在上传响应中增加 type 字段**

将 `src/app/api/upload/route.ts` 的 try 块修改为：

```typescript
  try {
    const { path, size } = await uploadMaterial(user.id, file)
    return NextResponse.json({ path, name: file.name, size, content_type: file.type })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
```

- [ ] **步骤 2：验证类型检查**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 3：Commit**

```bash
git add src/app/api/upload/route.ts
git commit -m "feat(upload): return content_type in upload response"
```

---

### 任务 5：端到端验证

- [ ] **步骤 1：启动开发服务器**

运行：`npm run dev`

- [ ] **步骤 2：验证限流生效**

快速连续请求 31 次 API：
```powershell
1..31 | ForEach-Object { (Invoke-WebRequest -Uri "http://localhost:3000/api/voices" -UseBasicParsing -ErrorAction SilentlyContinue).StatusCode }
```
预期：前 30 次返回 200，第 31 次返回 429

- [ ] **步骤 3：验证文件上传 + 解析**

通过浏览器创建节目，上传一个 .docx 或 .txt 文件作为素材，确认 pipeline parse 步骤成功提取文本（在 episode 详情页的脚本 tab 中确认素材被正确使用）。

- [ ] **步骤 4：确认 Sentry 配置就绪**

检查 `.env.example` 中包含 `SENTRY_DSN=` 说明。Sentry 代码已就位，仅需填入 DSN 即可激活。

- [ ] **步骤 5：最终 Commit**

```bash
git add -A
git commit -m "feat: P2 rate limiting + file parsing (complete)"
```
