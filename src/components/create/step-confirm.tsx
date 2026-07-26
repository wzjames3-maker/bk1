'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CostEstimator } from './cost-estimator'
import type { MaterialItem } from './material-uploader'
import type { EpisodeParams } from './step-params'

interface Props {
  title: string
  topic: string
  materials: MaterialItem[]
  params: EpisodeParams
  estimate: {
    llm_cost: number
    tts_cost: number
    mixing_cost: number
    total: number
    breakdown: { estimated_script_chars: number; estimated_llm_tokens: number; estimated_tts_chars: number }
  } | null
  balance: number
  estimateLoading: boolean
}

const STYLE_LABELS: Record<string, string> = {
  casual: '轻松闲聊', deep: '深度对谈', news: '新闻播报', story: '故事叙述',
}

export function StepConfirm({ title, topic, materials, params, estimate, balance, estimateLoading }: Props) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">节目概要</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">节目名称</span>
            <span className="font-medium">{title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">话题</span>
            <span>{topic}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">素材</span>
            <span>{materials.length} 份（共 {materials.reduce((sum, m) => sum + (m.text?.length || 0), 0)} 字）</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">时长</span>
            <span>{params.duration_min} 分钟</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">风格</span>
            <span>{STYLE_LABELS[params.style] || params.style}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">角色</span>
            <span>{params.roles_count} 人</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">脚本确认</span>
            <span>{params.skip_confirmation ? '跳过（直接生成）' : '需要确认'}</span>
          </div>
        </CardContent>
      </Card>

      <CostEstimator estimate={estimate} balance={balance} loading={estimateLoading} />
    </div>
  )
}
