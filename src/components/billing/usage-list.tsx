'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { UsageLog } from '@/types/database'

interface Props {
  usage: UsageLog[]
}

const TYPE_LABELS: Record<string, string> = {
  llm_token: 'LLM Token',
  tts_char: 'TTS 字符',
  storage_mb: '存储',
  mixing: '混音',
}

export function UsageList({ usage }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">用量明细</CardTitle>
      </CardHeader>
      <CardContent>
        {usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无用量记录</p>
        ) : (
          <div className="space-y-2">
            {usage.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">{TYPE_LABELS[item.type] || item.type}</span>
                  <p className="text-xs text-muted-foreground">
                    数量: {item.quantity.toLocaleString()} · {new Date(item.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">${item.cost.toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
