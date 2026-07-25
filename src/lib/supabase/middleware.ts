import { NextResponse, type NextRequest } from 'next/server'

/**
 * 轻量级 session 守卫：仅检查 cookie 存在性（零网络请求）
 * 真正的 getUser() 验证由各页面 Server Component 和 API 路由自行处理
 * 这样 proxy 层不会因远程 JWT 校验而阻塞每个请求
 */
export async function updateSession(request: NextRequest) {
  const hasSession = request.cookies.getAll().some(c => c.name.includes('auth-token'))

  // 受保护路由列表
  const protectedPaths = ['/dashboard', '/projects', '/create', '/billing', '/settings', '/episodes']
  const isProtected = protectedPaths.some(p => request.nextUrl.pathname.startsWith(p))

  // 无 session cookie 且访问受保护路由 → 重定向到 /login
  if (!hasSession && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next({ request })
}
