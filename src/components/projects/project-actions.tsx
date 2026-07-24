'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface Props {
  projectId: string
  projectName: string
  projectDescription: string | null
  episodeCount: number
}

export function ProjectActions({ projectId, projectName, projectDescription, episodeCount }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [name, setName] = useState(projectName)
  const [description, setDescription] = useState(projectDescription || '')

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('项目名称不能为空')
      return
    }
    setEditing(false)
    const res = await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: name.trim(), description: description.trim() || null }),
    })
    if (res.ok) {
      toast.success('项目已更新')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || '更新失败')
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    const res = await fetch('/api/projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId }),
    })
    if (res.ok) {
      toast.success('项目已删除')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || '删除失败')
      setDeleting(false)
      setConfirming(false)
    }
  }

  if (editing) {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="项目名称" className="h-8" />
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="简介（可选）" className="h-8" />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave}>保存</Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(projectName); setDescription(projectDescription || '') }}>取消</Button>
        </div>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/5 px-3 py-2">
        <span className="text-sm">
          删除「{projectName}」？{episodeCount > 0 ? `其下 ${episodeCount} 期节目将变为未归类。` : ''}
        </span>
        <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleting}>
          {deleting ? '删除中...' : '确认'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>取消</Button>
      </div>
    )
  }

  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(true)}>
        ✏️ 编辑
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => setConfirming(true)}>
        🗑️ 删除
      </Button>
    </div>
  )
}
