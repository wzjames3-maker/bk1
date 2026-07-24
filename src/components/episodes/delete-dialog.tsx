'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Props {
  episodeId: string
  episodeTitle: string
  onDeleted?: () => void
  variant?: 'button' | 'menu-item'
}

export function DeleteDialog({ episodeId, episodeTitle, onDeleted, variant = 'button' }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/episodes/${episodeId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '删除失败')
      }
      setConfirming(false)
      if (onDeleted) {
        onDeleted()
      } else {
        router.push('/episodes')
        router.refresh()
      }
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  if (!confirming) {
    return (
      <Button
        variant={variant === 'menu-item' ? 'ghost' : 'outline'}
        size="sm"
        className={variant === 'menu-item' ? 'w-full justify-start text-destructive' : 'text-destructive'}
        onClick={() => setConfirming(true)}
      >
        🗑️ 删除
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2">
      <span className="text-sm">
        确定删除「{episodeTitle}」？此操作不可恢复。
      </span>
      <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
        {deleting ? '删除中...' : '确认删除'}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
        取消
      </Button>
    </div>
  )
}
