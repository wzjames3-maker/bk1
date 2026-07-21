'use client'

import { cn } from '@/lib/utils'
import type { EpisodeStep } from '@/types/database'
import type { EpisodeStatus } from '@/types/database'

interface Props {
  status: EpisodeStatus
  steps: EpisodeStep[]
  failedAtStep: string | null
}

const STEP_LABELS: Record<string, string> = {
  parsing: '素材解析',
  scripting: 'AI 编剧',
  confirming: '脚本确认',
  tts_processing: '语音合成',
  mixing: '混音处理',
  post_processing: '后处理',
}

const STEP_ICONS: Record<string, string> = {
  parsing: '📄',
  scripting: '✍️',
  confirming: '👀',
  tts_processing: '🎙️',
  mixing: '🎵',
  post_processing: '📝',
}

export function PipelineProgress({ status, steps, failedAtStep }: Props) {
  const allStepKeys = ['parsing', 'scripting', 'confirming', 'tts_processing', 'mixing', 'post_processing']

  const getStepState = (stepKey: string) => {
    const stepLog = steps.find(s => s.step === stepKey)
    if (stepLog) {
      if (stepLog.status === 'done') return 'done'
      if (stepLog.status === 'running') return 'running'
      if (stepLog.status === 'failed') return 'failed'
    }
    if (status === 'completed') return 'done'
    if (status === 'failed' && failedAtStep === stepKey) return 'failed'
    return 'pending'
  }

  return (
    <div className="space-y-1">
      {allStepKeys.map((key, i) => {
        const state = getStepState(key)
        const stepLog = steps.find(s => s.step === key)

        return (
          <div key={key} className="flex items-center gap-3">
            {/* 连接线 */}
            <div className="flex flex-col items-center">
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm border',
                state === 'done' && 'bg-green-100 border-green-300 text-green-700',
                state === 'running' && 'bg-blue-100 border-blue-300 text-blue-700 animate-pulse',
                state === 'failed' && 'bg-red-100 border-red-300 text-red-700',
                state === 'pending' && 'bg-muted border-border text-muted-foreground',
              )}>
                {state === 'done' ? '✓' : state === 'failed' ? '✕' : STEP_ICONS[key]}
              </div>
              {i < allStepKeys.length - 1 && (
                <div className={cn(
                  'h-4 w-px',
                  state === 'done' ? 'bg-green-300' : 'bg-border'
                )} />
              )}
            </div>

            {/* 标签 */}
            <div className="flex-1 py-1">
              <p className={cn(
                'text-sm font-medium',
                state === 'pending' && 'text-muted-foreground'
              )}>
                {STEP_LABELS[key]}
              </p>
              {state === 'running' && (
                <p className="text-xs text-blue-600">处理中...</p>
              )}
              {state === 'failed' && stepLog?.error_message && (
                <p className="text-xs text-red-600 truncate max-w-xs">{stepLog.error_message}</p>
              )}
              {state === 'done' && stepLog?.finished_at && stepLog?.started_at && (
                <p className="text-xs text-muted-foreground">
                  耗时 {Math.round((new Date(stepLog.finished_at).getTime() - new Date(stepLog.started_at).getTime()) / 1000)}s
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
