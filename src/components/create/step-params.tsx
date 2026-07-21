'use client'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { VoicePicker } from './voice-picker'

export interface EpisodeParams {
  duration_min: number
  style: string
  roles_count: number
  voice_ids: string[]
  bgm: string
  skip_confirmation: boolean
}

interface Props {
  params: EpisodeParams
  onChange: (params: EpisodeParams) => void
}

const STYLES = [
  { value: 'casual', label: '轻松闲聊' },
  { value: 'deep', label: '深度对谈' },
  { value: 'news', label: '新闻播报' },
  { value: 'story', label: '故事叙述' },
]

const BGM_OPTIONS = [
  { value: 'none', label: '无背景音乐' },
  { value: 'light', label: '轻快' },
  { value: 'calm', label: '舒缓' },
  { value: 'tech', label: '科技感' },
]

export function StepParams({ params, onChange }: Props) {
  const update = (partial: Partial<EpisodeParams>) => {
    const next = { ...params, ...partial }
    // 角色数减少时裁剪已选音色
    if (partial.roles_count && next.voice_ids.length > partial.roles_count) {
      next.voice_ids = next.voice_ids.slice(0, partial.roles_count)
    }
    onChange(next)
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>目标时长</Label>
          <Select
            value={String(params.duration_min)}
            onValueChange={(v) => update({ duration_min: Number(v) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5 分钟</SelectItem>
              <SelectItem value="10">10 分钟</SelectItem>
              <SelectItem value="20">20 分钟</SelectItem>
              <SelectItem value="30">30 分钟</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>对话风格</Label>
          <Select value={params.style} onValueChange={(v) => update({ style: v ?? undefined })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>角色数量</Label>
          <Select
            value={String(params.roles_count)}
            onValueChange={(v) => update({ roles_count: Number(v) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 人对话</SelectItem>
              <SelectItem value="3">3 人讨论</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>背景音乐</Label>
          <Select value={params.bgm} onValueChange={(v) => update({ bgm: v ?? undefined })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BGM_OPTIONS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>选择角色音色（{params.voice_ids.length}/{params.roles_count}）</Label>
        <VoicePicker
          selected={params.voice_ids}
          onChange={(ids) => update({ voice_ids: ids })}
          maxCount={params.roles_count}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <Label>跳过脚本确认</Label>
          <p className="text-sm text-muted-foreground">生成后直接合成，不等待你确认脚本</p>
        </div>
        <Switch
          checked={params.skip_confirmation}
          onCheckedChange={(v) => update({ skip_confirmation: v })}
        />
      </div>
    </div>
  )
}
