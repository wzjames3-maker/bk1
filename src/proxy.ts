import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { rateLimit } from '@/lib/rate-limit'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 仅对 /api/ 路由限流（排除内部 pipeline 调用）
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/pipeline/')) {
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
