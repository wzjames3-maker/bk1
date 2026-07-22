'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MaterialUploader, type MaterialItem } from './material-uploader'

interface Props {
  topic: string
  onTopicChange: (topic: string) => void
  materials: MaterialItem[]
  onMaterialsChange: (materials: MaterialItem[]) => void
}

export function StepMaterials({ topic, onTopicChange, materials, onMaterialsChange }: Props) {
  return (
    <div className="space-y-6">
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
    </div>
  )
}
