'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MaterialUploader, type MaterialItem } from './material-uploader'
import { ScriptInput } from './script-input'
import type { ScriptSegment } from '@/types/database'

interface Props {
  title: string
  onTitleChange: (title: string) => void
  topic: string
  onTopicChange: (topic: string) => void
  materials: MaterialItem[]
  onMaterialsChange: (materials: MaterialItem[]) => void
  mode: 'ai' | 'script'
  onModeChange: (m: 'ai' | 'script') => void
  segments: ScriptSegment[]
  onSegmentsChange: (s: ScriptSegment[]) => void
  polishEnabled: boolean
  onPolishChange: (v: boolean) => void
}

export function StepMaterials({ title, onTitleChange, topic, onTopicChange, materials, onMaterialsChange, mode, onModeChange, segments, onSegmentsChange, polishEnabled, onPolishChange }: Props) {
  return (
    <div className="space-y-6">
      {/* 节目名称（始终显示，两种模式都需要） */}
      <div className="space-y-2">
        <Label htmlFor="episode-title" className="text-base">节目名称 *</Label>
        <Input
          id="episode-title"
          placeholder="例如：AI Agent 深度解析 第3期"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          maxLength={100}
        />
        <p className="text-sm text-muted-foreground">
          给你的播客起一个名字，方便后续查找和管理
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        <Button
          variant={mode === 'ai' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModeChange('ai')}
        >
          🤖 AI 编剧
        </Button>
        <Button
          variant={mode === 'script' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModeChange('script')}
        >
          📝 我的脚本
        </Button>
      </div>

      {mode === 'ai' ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="topic" className="text-base">话题方向 *</Label>
            <Input
              id="topic"
              placeholder="例如：AI Agent 的未来发展趋势"
              value={topic}
              onChange={(e) => onTopicChange(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              告诉 AI 这期播客要聊什么方向
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-base">参考素材（可选）</Label>
            <MaterialUploader materials={materials} onChange={onMaterialsChange} />
            <p className="text-sm text-muted-foreground">
              提供文章、链接或文本作为播客内容参考
            </p>
          </div>
        </>
      ) : (
        <ScriptInput
          segments={segments}
          onSegmentsChange={onSegmentsChange}
          polishEnabled={polishEnabled}
          onPolishChange={onPolishChange}
        />
      )}
    </div>
  )
}
