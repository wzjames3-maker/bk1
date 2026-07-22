'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import type { ScriptSegment } from '@/types/database'

interface Props {
  script: ScriptSegment[]
  onSave: (script: ScriptSegment[]) => Promise<void>
  onCancel: () => void
}

export function ScriptEditor({ script, onSave, onCancel }: Props) {
  const [segments, setSegments] = useState<ScriptSegment[]>(script)
  const [saving, setSaving] = useState(false)

  const updateSegment = (index: number, field: keyof ScriptSegment, value: string | number) => {
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const removeSegment = (index: number) => {
    setSegments(prev => prev.filter((_, i) => i !== index))
  }

  const addSegment = (afterIndex: number) => {
    const newSeg: ScriptSegment = { role: segments[afterIndex]?.role || '主持人', text: '', emotion: '中性', pause_ms: 500 }
    setSegments(prev => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, newSeg)
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(segments)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{segments.length} 段对话</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存脚本'}
          </Button>
        </div>
      </div>

      {segments.map((seg, i) => (
        <Card key={i}>
          <CardContent className="space-y-2 py-3">
            <div className="flex items-center gap-2">
              <Input
                className="w-24 h-8 text-sm"
                value={seg.role}
                onChange={(e) => updateSegment(i, 'role', e.target.value)}
              />
              <Input
                className="w-20 h-8 text-sm"
                value={seg.emotion}
                onChange={(e) => updateSegment(i, 'emotion', e.target.value)}
              />
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => addSegment(i)}>+ 插入</Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeSegment(i)}>删除</Button>
            </div>
            <Textarea
              rows={2}
              value={seg.text}
              onChange={(e) => updateSegment(i, 'text', e.target.value)}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
