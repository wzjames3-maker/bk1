'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { DeleteDialog } from './delete-dialog'

interface EpisodeItem {
  id: string
  title: string | null
  topic: string
  status: string
  created_at: string
  audio_url: string | null
  estimated_cost: number | null
  completed_at: string | null
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '等待中', variant: 'secondary' },
  parsing: { label: '解析中', variant: 'default' },
  scripting: { label: '编剧中', variant: 'default' },
  script_ready: { label: '待确认', variant: 'outline' },
  confirming: { label: '确认中', variant: 'default' },
  tts_processing: { label: '合成中', variant: 'default' },
  mixing: { label: '混音中', variant: 'default' },
  post_processing: { label: '后处理', variant: 'default' },
  completed: { label: '已完成', variant: 'default' },
  failed: { label: '失败', variant: 'destructive' },
}

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'processing', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
]

export function EpisodeList() {
  const router = useRouter()
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const fetchEpisodes = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (filter !== 'all') params.set('status', filter)
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/episodes?${params}`)
      const data = await res.json()
      setEpisodes(data.episodes || [])
      setTotalPages(data.totalPages || 1)
      setTotal(data.total || 0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filter, page, search])

  useEffect(() => {
    fetchEpisodes()
  }, [fetchEpisodes])

  // 有进行中的节目时自动刷新（5s 轮询）
  const hasProcessing = episodes.some(ep => !['completed', 'failed'].includes(ep.status))
  useEffect(() => {
    if (!hasProcessing) return
    const timer = setInterval(() => fetchEpisodes(), 5000)
    return () => clearInterval(timer)
  }, [hasProcessing, fetchEpisodes])

  const handleRegenerate = async (id: string) => {
    setRegenerating(id)
    try {
      const res = await fetch(`/api/episodes/${id}/regenerate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '重新生成失败')
      toast.success('已开始重新生成')
      router.push(`/episodes/${data.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRegenerating(null)
    }
  }

  const handleDeleted = () => {
    fetchEpisodes()
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="搜索标题或话题..."
          className="h-8 w-48"
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => {
              setSearch(v)
              setPage(1)
            }, 300)
          }}
        />
        {FILTERS.map(f => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter(f.value); setPage(1) }}
          >
            {f.label}
          </Button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">共 {total} 期</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 py-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : episodes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="text-4xl">🎙️</span>
            <p className="font-medium">{search ? `没有找到与「${search}」相关的节目` : '还没有节目'}</p>
            <p className="text-sm text-muted-foreground">
              {search ? '试试其他关键词，或清除搜索条件' : '点击下方按钮，开始制作你的第一期播客'}
            </p>
            {!search && (
              <Link href="/create">
                <Button className="mt-2">✨ 创建新节目</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {episodes.map(ep => {
            const st = STATUS_MAP[ep.status] || { label: ep.status, variant: 'secondary' as const }
            return (
              <Card key={ep.id} className="transition-colors hover:bg-muted/30">
                <CardContent className="flex items-center gap-4 py-3">
                  <Link href={`/episodes/${ep.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{ep.title || ep.topic || '未命名节目'}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ep.created_at).toLocaleString('zh-CN')}
                      {ep.estimated_cost ? ` · $${Number(ep.estimated_cost).toFixed(4)}` : ''}
                    </p>
                  </Link>
                  <Badge variant={st.variant}>{st.label}</Badge>
                  <div className="flex items-center gap-1">
                    {(ep.status === 'completed' || ep.status === 'failed') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={regenerating === ep.id}
                        onClick={() => handleRegenerate(ep.id)}
                      >
                        {regenerating === ep.id ? '生成中...' : '🔄 重新生成'}
                      </Button>
                    )}
                    <DeleteDialog
                      episodeId={ep.id}
                      episodeTitle={ep.title || ep.topic || '未命名节目'}
                      onDeleted={handleDeleted}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            下一页
          </Button>
        </div>
      )}
    </div>
  )
}
