'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { CommandPalette } from './command-palette'
import { Button } from '@/components/ui/button'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏：桌面固定，移动端抽屉 */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transform transition-transform md:static md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <main className="flex-1 overflow-y-auto">
        {/* 移动端顶栏 */}
        <div className="flex h-14 items-center border-b px-4 md:hidden">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)}>
            ☰
          </Button>
          <span className="ml-3 font-bold">🎧 PodCast AI</span>
        </div>
        <div className="mx-auto max-w-6xl p-4 md:p-8">{children}</div>
      </main>
      <CommandPalette />
    </div>
  )
}
