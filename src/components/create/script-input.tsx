'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { parseScript } from '@/lib/services/script-parser'
import type { ScriptSegment } from '@/types/database'

interface Props {
  segments: ScriptSegment[]
  onSegmentsChange: (segments: ScriptSegment[]) => void
  polishEnabled: boolean
  onPolishChange: (v: boolean) => void
}

export function ScriptInput({ segments, onSegmentsChange, polishEnabled, onPolishChange }: Props) {
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState(false)
  const [polishing, setPolishing] = useState(false)

  const handleParse = () => {
    const result = parseScript(rawText)
    onSegmentsChange(result)
    setParsed(result.length > 0)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    let text = ''
    if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      text = await file.text()
    } else if (file.name.endsWith('.docx')) {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      text = data.text || ''
    } else {
      text = await file.text()
    }

    setRawText(text)
    const result = parseScript(text)
    onSegmentsChange(result)
    setParsed(result.length > 0)
  }

  const handlePolish = async () => {
    setPolishing(true)
    try {
      const res = await fetch('/api/script/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments }),
      })
      const data = await res.json()
      if (data.segments) onSegmentsChange(data.segments)
    } finally {
      setPolishing(false)
    }
  }

  const handleSegmentEdit = (index: number, text: string) => {
    const updated = [...segments]
    updated[index] = { ...updated[index], text }
    onSegmentsChange(updated)
  }

  const handleSegmentDelete = (index: number) => {
    onSegmentsChange(segments.filter((_, i) => i !== index))
  }

  const totalChars = segments.reduce((sum, s) => sum + s.text.length, 0)
  const uniqueRoles = [...new Set(segments.map(s => s.role))]

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>粘贴或输入脚本</Label>
        <Textarea
          placeholder={'支持两种格式：\n\n结构化对话：\n小林：大家好\n老陈：你好\n\n或纯文本（系统自动拆段）'}
          className="min-h-[200px] font-mono text-sm"
          value={rawText}
          onChange={(e) => { setRawText(e.target.value); setParsed(false) }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleParse} disabled={!rawText.trim()}>
          解析预览
        </Button>
        <label className="cursor-pointer">
          <input type="file" accept=".txt,.docx,.md" className="hidden" onChange={handleFileUpload} />
          <Button variant="outline" size="sm">
            上传文件
          </Button>
        </label>
      </div>

      {parsed && segments.length > 0 && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            共 {segments.length} 段 · 约 {totalChars} 字 · 角色：{uniqueRoles.join('、')}
          </p>
          <div className="max-h-[300px] space-y-2 overflow-y-auto">
            {segments.map((seg, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 shrink-0 font-medium text-primary">{seg.role}：</span>
                <input
                  className="flex-1 rounded border px-2 py-1 text-sm bg-background"
                  value={seg.text}
                  onChange={(e) => handleSegmentEdit(i, e.target.value)}
                />
                <button
                  className="mt-1.5 text-muted-foreground hover:text-destructive"
                  onClick={() => handleSegmentDelete(i)}
                  aria-label="删除段落"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {parsed && segments.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={polishEnabled} onCheckedChange={onPolishChange} />
            <Label className="text-sm">AI 润色脚本</Label>
          </div>
          {polishEnabled && (
            <Button size="sm" variant="secondary" onClick={handlePolish} disabled={polishing}>
              {polishing ? '润色中...' : '执行润色'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
