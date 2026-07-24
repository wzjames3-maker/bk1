'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { LayoutDashboard, Mic, ListMusic, Sparkles, CreditCard, Settings } from 'lucide-react'

interface EpisodeResult {
  id: string
  title: string | null
  topic: string
  status: string
}

const PAGES = [
  { id: 'dashboard', label: '工作台', href: '/dashboard', icon: LayoutDashboard },
  { id: 'projects', label: '播客项目', href: '/projects', icon: Mic },
  { id: 'episodes', label: '我的作品', href: '/episodes', icon: ListMusic },
  { id: 'create', label: '创建节目', href: '/create', icon: Sparkles },
  { id: 'billing', label: '账单中心', href: '/billing', icon: CreditCard },
  { id: 'settings', label: '设置', href: '/settings', icon: Settings },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [episodes, setEpisodes] = useState<EpisodeResult[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!query.trim()) { setEpisodes([]); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/episodes?q=${encodeURIComponent(query)}&page=1`)
        const data = await res.json()
        setEpisodes(data.episodes || [])
      } catch { /* ignore */ }
      setSearching(false)
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  const go = (href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg rounded-xl border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <Command label="全局搜索" shouldFilter={false}>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="搜索节目或跳转页面..."
            className="w-full border-b px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Group heading="页面">
              {PAGES.filter(p => !query || p.label.toLowerCase().includes(query.toLowerCase())).map(p => (
                <Command.Item
                  key={p.id}
                  onSelect={() => go(p.href)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
                >
                  <p.icon className="size-4 text-muted-foreground" />
                  {p.label}
                </Command.Item>
              ))}
            </Command.Group>

            {(query.trim()) && (
              <Command.Group heading="节目">
                {searching && <p className="px-3 py-2 text-sm text-muted-foreground">搜索中...</p>}
                {!searching && episodes.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">无匹配结果</p>
                )}
                {episodes.map(ep => (
                  <Command.Item
                    key={ep.id}
                    onSelect={() => go(`/episodes/${ep.id}`)}
                    className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm aria-selected:bg-muted"
                  >
                    <span className="truncate">{ep.title || ep.topic}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">{ep.status}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
