'use client'

import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface MaterialItem {
  type: 'file' | 'url' | 'text'
  name: string
  path?: string      // Storage path (file)
  url?: string       // 原始 URL
  text?: string      // 直接文本
  size?: number
  status: 'uploading' | 'ready' | 'error'
}

interface Props {
  materials: MaterialItem[]
  onChange: (materials: MaterialItem[]) => void
}

export function MaterialUploader({ materials, onChange }: Props) {
  const [urlInput, setUrlInput] = useState('')
  const [textInput, setTextInput] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const materialsRef = useRef(materials)
  materialsRef.current = materials

  const handleFileUpload = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      const item: MaterialItem = {
        type: 'file',
        name: file.name,
        size: file.size,
        status: 'uploading',
      }
      onChange([...materialsRef.current, item])

      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()

        if (!res.ok) throw new Error(data.error)

        onChange(materialsRef.current.map(m =>
          m.name === file.name && m.status === 'uploading'
            ? { ...m, path: data.path, status: 'ready' as const }
            : m
        ))
      } catch {
        onChange(materialsRef.current.map(m =>
          m.name === file.name && m.status === 'uploading'
            ? { ...m, status: 'error' as const }
            : m
        ))
      }
    }
  }, [onChange])

  const handleAddUrl = () => {
    if (!urlInput.trim()) return
    const item: MaterialItem = {
      type: 'url',
      name: urlInput.trim(),
      url: urlInput.trim(),
      status: 'ready',
    }
    onChange([...materials, item])
    setUrlInput('')
  }

  const handleAddText = () => {
    if (!textInput.trim()) return
    const item: MaterialItem = {
      type: 'text',
      name: `文本输入 (${textInput.length} 字)`,
      text: textInput.trim(),
      status: 'ready',
    }
    onChange([...materials, item])
    setTextInput('')
  }

  const handleRemove = (index: number) => {
    onChange(materials.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="file">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="file">📎 上传文件</TabsTrigger>
          <TabsTrigger value="url">🔗 网页链接</TabsTrigger>
          <TabsTrigger value="text">✏️ 输入文本</TabsTrigger>
        </TabsList>

        <TabsContent value="file" className="pt-4">
          <div
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? 'border-primary bg-muted/50' : 'border-muted-foreground/25'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files) }}
          >
            <p className="text-muted-foreground mb-4">拖拽文件到此处，或</p>
            <label>
              <input
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              />
              <Button variant="outline" render={<span />}>
                选择文件
              </Button>
            </label>
            <p className="text-xs text-muted-foreground mt-2">支持 PDF、Word、TXT，最大 10MB</p>
          </div>
        </TabsContent>

        <TabsContent value="url" className="pt-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/article"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            />
            <Button onClick={handleAddUrl} disabled={!urlInput.trim()}>添加</Button>
          </div>
        </TabsContent>

        <TabsContent value="text" className="pt-4">
          <Textarea
            placeholder="粘贴或输入文本内容..."
            rows={6}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
          />
          <Button className="mt-2" onClick={handleAddText} disabled={!textInput.trim()}>
            添加文本
          </Button>
        </TabsContent>
      </Tabs>

      {/* 已添加素材列表 */}
      {materials.length > 0 && (
        <div className="space-y-2">
          {materials.map((item, i) => (
            <Card key={i}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2">
                  <span>{item.type === 'file' ? '📄' : item.type === 'url' ? '🔗' : '📝'}</span>
                  <span className="text-sm">{item.name}</span>
                  {item.status === 'uploading' && <span className="text-xs text-muted-foreground">上传中...</span>}
                  {item.status === 'error' && <span className="text-xs text-destructive">上传失败</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRemove(i)}>✕</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
