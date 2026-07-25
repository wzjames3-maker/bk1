import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { rateLimit } from '@/lib/rate-limit'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 仅对 /api/ 路由限流（排除内部 pipeline 调用）
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/pipeline/')) {
    const authCookie = request.cookies.get('sb-jsvlhnrlgmbcozqncbyo-auth-token')
    // 使用 cookie 值的简单哈希作为用户标识（避免 JWT 前缀相同导致共享桶）
    const raw = authCookie?.value || ''
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anonymous'
    const identifier = raw ? raw.slice(-32) : ip

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
