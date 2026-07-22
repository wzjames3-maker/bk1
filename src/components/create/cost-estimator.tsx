'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Props {
  estimate: {
    llm_cost: number
    tts_cost: number
    mixing_cost: number
    total: number
    breakdown: {
      estimated_script_chars: number
      estimated_llm_tokens: number
      estimated_tts_chars: number
    }
  } | null
  balance: number
  loading: boolean
}

export function CostEstimator({ estimate, balance, loading }: Props) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">正在估算费用...</p>
  }

  if (!estimate) return null

  const sufficient = balance >= estimate.total

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">费用预估</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">AI 编剧 (LLM)</span>
            <span>${estimate.llm_cost.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">语音合成 (TTS)</span>
            <span>${estimate.tts_cost.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">混音处理</span>
            <span>${estimate.mixing_cost.toFixed(4)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-medium">
            <span>合计</span>
            <span>${estimate.total.toFixed(4)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            账户余额：${balance.toFixed(2)}
          </span>
          <Badge variant={sufficient ? 'default' : 'destructive'}>
            {sufficient ? '余额充足' : '余额不足'}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          预估脚本约 {estimate.breakdown.estimated_script_chars} 字 ·
          最终按实际用量结算，多退少补
        </p>
      </CardContent>
    </Card>
  )
}
