'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StepMaterials } from './step-materials'
import { StepParams, type EpisodeParams } from './step-params'
import { StepConfirm } from './step-confirm'
import type { MaterialItem } from './material-uploader'
import type { ScriptSegment } from '@/types/database'

const STEPS = ['输入素材', '设置参数', '确认生成']

export function CreateWizard() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // Step 1 数据
  const [topic, setTopic] = useState('')
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [mode, setMode] = useState<'ai' | 'script'>('ai')
  const [segments, setSegments] = useState<ScriptSegment[]>([])
  const [polishEnabled, setPolishEnabled] = useState(false)

  // Step 2 数据
  const [params, setParams] = useState<EpisodeParams>({
    duration_min: 10,
    style: 'casual',
    roles_count: 1,
    voice_ids: [],
    bgm: 'light',
    skip_confirmation: false,
  })
  const [projectId, setProjectId] = useState<string | null>(null)

  // Step 3 数据
  const [estimate, setEstimate] = useState<{
    llm_cost: number
    tts_cost: number
    mixing_cost: number
    total: number
    breakdown: { estimated_script_chars: number; estimated_llm_tokens: number; estimated_tts_chars: number }
  } | null>(null)
  const [balance, setBalance] = useState(0)
  const [estimateLoading, setEstimateLoading] = useState(false)

  // 进入 Step 3 时获取费用预估
  useEffect(() => {
    if (step !== 2) return

    // 文件类素材用 size/3 粗估字符数（中文 UTF-8 约 3 字节/字）
    const materialChars = materials.reduce((sum, m) => {
      if (m.text) return sum + m.text.length
      if (m.size) return sum + Math.round(m.size / 3)
      return sum
    }, 0)

    fetch('/api/billing/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duration_min: params.duration_min,
        roles_count: params.roles_count,
        material_char_count: mode === 'ai' ? materialChars : 0,
        script_char_count: mode === 'script'
          ? segments.reduce((sum, s) => sum + s.text.length, 0)
          : undefined,
      }),
    })
      .then(res => res.json())
      .then(data => {
        const { balance: bal, ...costData } = data
        setEstimate(costData)
        setBalance(bal ?? 0)
      })
      .catch(console.error)
      .finally(() => setEstimateLoading(false))
  }, [step, params.duration_min, params.roles_count, materials, mode, segments])

  const canNext = () => {
    if (step === 0) {
      if (mode === 'script') return segments.length > 0
      return topic.trim().length > 0
    }
    if (step === 1) {
      return (
        params.voice_ids.length > 0 &&
        params.voice_ids.length === params.roles_count
      )
    }
    return true
  }

  const validationHint = (): string | null => {
    if (step === 0) {
      if (mode === 'script' && segments.length === 0) {
        return '请输入或上传脚本内容'
      }
      if (mode === 'ai' && !topic.trim()) {
        return '请输入播客话题'
      }
    }
    if (step === 1) {
      if (params.voice_ids.length === 0) {
        return '请为所有角色选择音色'
      }
      if (params.voice_ids.length < params.roles_count) {
        return `还需为 ${params.roles_count - params.voice_ids.length} 个角色选择音色`
      }
    }
    if (step === 2) {
      if (!estimate) return '正在计算费用...'
      if (balance < (estimate?.total || 0)) {
        return `余额不足（需 $${estimate.total.toFixed(4)}，当前 $${balance.toFixed(4)}）`
      }
    }
    return null
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: mode === 'script' ? (topic.trim() || '用户脚本') : topic,
          materials: mode === 'ai' ? materials.map(m => ({
            type: m.type,
            url: m.url || m.path || '',
            text: m.text,
            name: m.name,
            content_type: m.content_type,
          })) : [],
          script: mode === 'script' ? segments : undefined,
          params: {
            duration_min: params.duration_min,
            style: params.style,
            roles_count: mode === 'script'
              ? [...new Set(segments.map(s => s.role))].length
              : params.roles_count,
            voice_ids: params.voice_ids,
            bgm: params.bgm,
            skip_confirmation: params.skip_confirmation,
          },
          project_id: projectId || undefined,
          estimated_cost: estimate?.total || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      router.push(`/episodes/${data.id}`)
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* 步骤指示器 */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium',
              i === step && 'bg-primary text-primary-foreground',
              i < step && 'bg-primary/20 text-primary',
              i > step && 'bg-muted text-muted-foreground'
            )}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={cn('text-sm', i === step && 'font-medium')}>{label}</span>
            {i < STEPS.length - 1 && <div className="mx-2 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {/* 步骤内容 */}
      {step === 0 && (
        <StepMaterials
          topic={topic}
          onTopicChange={setTopic}
          materials={materials}
          onMaterialsChange={setMaterials}
          mode={mode}
          onModeChange={setMode}
          segments={segments}
          onSegmentsChange={setSegments}
          polishEnabled={polishEnabled}
          onPolishChange={setPolishEnabled}
        />
      )}
      {step === 1 && (
        <StepParams
          params={params}
          projectId={projectId}
          onProjectIdChange={setProjectId}
          onChange={(nextParams) => {
            setParams(nextParams)
            setEstimateLoading(true)
          }}
          scriptRoles={mode === 'script' ? [...new Set(segments.map(s => s.role))] : undefined}
        />
      )}
      {step === 2 && (
        <StepConfirm
          topic={topic}
          materials={materials}
          params={params}
          estimate={estimate}
          balance={balance}
          estimateLoading={estimateLoading}
        />
      )}

      {/* 导航按钮 */}
      <div className="space-y-2">
        {validationHint() && (
          <p className="text-right text-sm text-destructive">{validationHint()}</p>
        )}
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
            上一步
          </Button>
          {step < 2 ? (
            <Button
              onClick={() => {
                if (step === 1) setEstimateLoading(true)
                setStep(s => s + 1)
              }}
              disabled={!canNext()}
            >
              下一步
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !estimate || balance < (estimate?.total || 0)}
            >
              {submitting ? '创建中...' : `确认生成（$${estimate?.total?.toFixed(4) || '...'}）`}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
