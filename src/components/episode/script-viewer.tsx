'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ScriptSegment } from '@/types/database'

interface Props {
  script: ScriptSegment[]
}

const EMOTION_COLORS: Record<string, string> = {
  '中性': 'bg-gray-100 text-gray-700',
  '开心': 'bg-yellow-100 text-yellow-700',
  '惊讶': 'bg-purple-100 text-purple-700',
  '思考': 'bg-blue-100 text-blue-700',
  '兴奋': 'bg-orange-100 text-orange-700',
}

export function ScriptViewer({ script }: Props) {
  if (!script || script.length === 0) {
    return <p className="text-muted-foreground text-sm">暂无脚本</p>
  }

  return (
    <div className="space-y-3">
      {script.map((seg, i) => (
        <Card key={i}>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">{seg.role}</span>
              <Badge variant="outline" className={EMOTION_COLORS[seg.emotion] || ''}>
                {seg.emotion}
              </Badge>
            </div>
            <p className="text-sm leading-relaxed">{seg.text}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
