'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard', label: '工作台', icon: '📊' },
  { href: '/projects', label: '播客项目', icon: '🎙️' },
  { href: '/create', label: '创建节目', icon: '✨' },
  { href: '/billing', label: '账单中心', icon: '💳' },
  { href: '/settings', label: '设置', icon: '⚙️' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-muted/40">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="text-lg font-bold">
          🎧 PodCast AI
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant={pathname === item.href ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start gap-3',
                pathname === item.href && 'bg-muted font-medium'
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Button>
          </Link>
        ))}
      </nav>
      <div className="border-t p-4">
        <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" onClick={handleLogout}>
          <span>🚪</span>
          退出登录
        </Button>
      </div>
    </aside>
  )
}
