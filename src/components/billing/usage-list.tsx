'use client'

import type { UsageLog } from '@/types/database'

const TYPE_LABELS: Record<string, string> = {
  llm_token: 'LLM Token',
  tts_char: 'TTS 字符',
  storage_mb: '存储',
  mixing: '混音',
}

export function UsageList({ usage }: { usage: UsageLog[] }) {
  if (usage.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">暂无用量记录</p>
  }

  return (
    <div className="space-y-1">
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
  )
}
