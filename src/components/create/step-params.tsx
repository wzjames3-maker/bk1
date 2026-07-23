'use client'

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { VoicePicker } from './voice-picker'
import type { Voice } from '@/types/database'

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
  projectId: string | null
  onProjectIdChange: (id: string | null) => void
  scriptRoles?: string[]
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

export function StepParams({ params, onChange, projectId, onProjectIdChange, scriptRoles }: Props) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [voices, setVoices] = useState<Voice[]>([])
  const [voiceMapping, setVoiceMapping] = useState<Record<string, string>>({})
  const [matching, setMatching] = useState(false)

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then((list) => {
        if (!Array.isArray(list)) return
        setProjects(list)
        if (!projectId && list[0]?.id) onProjectIdChange(list[0].id)
      })
      .catch(console.error)
    // 仅挂载时拉取项目列表
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 获取音色列表（脚本模式下用于下拉选择）
  const rolesKey = scriptRoles?.join(',') || ''
  useEffect(() => {
    if (!rolesKey) return
    fetch('/api/voices')
      .then(res => res.json())
      .then(setVoices)
      .catch(console.error)
  }, [rolesKey])

  // 脚本模式：自动设置 roles_count
  useEffect(() => {
    if (!scriptRoles || scriptRoles.length === 0) return
    if (params.roles_count !== scriptRoles.length) {
      onChange({ ...params, roles_count: scriptRoles.length })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesKey])

  // 脚本模式：调用 LLM 音色匹配（仅一次）
  useEffect(() => {
    if (!scriptRoles || scriptRoles.length === 0) return
    setMatching(true)
    fetch('/api/voices/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roles: scriptRoles }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.mapping) {
          setVoiceMapping(data.mapping)
          const ids = scriptRoles.map(r => data.mapping[r]).filter(Boolean)
          onChange({ ...params, voice_ids: ids, roles_count: scriptRoles.length })
        }
      })
      .catch(console.error)
      .finally(() => setMatching(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesKey])

  const update = (partial: Partial<EpisodeParams>) => {
    const next = { ...params, ...partial }
    if (partial.roles_count && next.voice_ids.length > partial.roles_count) {
      next.voice_ids = next.voice_ids.slice(0, partial.roles_count)
    }
    onChange(next)
  }

  const voicesIncomplete = params.voice_ids.length !== params.roles_count

  return (
    <div className="space-y-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>归属项目</Label>
          <Select
            value={projectId}
            onValueChange={(v) => onProjectIdChange(v || null)}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="选择项目" /></SelectTrigger>
            <SelectContent>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>目标时长</Label>
          <Select
            value={String(params.duration_min)}
            onValueChange={(v) => update({ duration_min: Number(v) })}
          >
            <SelectTrigger><SelectValue>{String(params.duration_min)} 分钟</SelectValue></SelectTrigger>
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
            <SelectTrigger><SelectValue>{STYLES.find(s => s.value === params.style)?.label || params.style}</SelectValue></SelectTrigger>
            <SelectContent>
              {STYLES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>角色数量</Label>
          {scriptRoles && scriptRoles.length > 0 ? (
            <Select value={String(scriptRoles.length)} disabled>
              <SelectTrigger className="opacity-60"><SelectValue>{scriptRoles.length} 人（脚本角色）</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value={String(scriptRoles.length)}>{scriptRoles.length} 人（脚本角色）</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Select
              value={String(params.roles_count)}
              onValueChange={(v) => update({ roles_count: Number(v) })}
            >
              <SelectTrigger><SelectValue>{params.roles_count} 人{params.roles_count === 1 ? '独白' : params.roles_count === 2 ? '对话' : '讨论'}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 人独白</SelectItem>
                <SelectItem value="2">2 人对话</SelectItem>
                <SelectItem value="3">3 人讨论</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label>背景音乐</Label>
          <Select value={params.bgm} onValueChange={(v) => update({ bgm: v ?? undefined })}>
            <SelectTrigger><SelectValue>{BGM_OPTIONS.find(b => b.value === params.bgm)?.label || params.bgm}</SelectValue></SelectTrigger>
            <SelectContent>
              {BGM_OPTIONS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        {scriptRoles && scriptRoles.length > 0 ? (
          <>
            <Label>角色音色匹配{matching && '（匹配中...）'}</Label>
            <div className="space-y-2">
              {scriptRoles.map(role => (
                <div key={role} className="flex items-center gap-2 text-sm">
                  <span className="w-16 font-medium">{role}</span>
                  <span>→</span>
                  <Select
                    value={voiceMapping[role] || null}
                    onValueChange={(v) => {
                      if (!v) return
                      const newMapping: Record<string, string> = { ...voiceMapping, [role]: v }
                      setVoiceMapping(newMapping)
                      const ids = scriptRoles.map(r => newMapping[r]).filter((id): id is string => Boolean(id))
                      onChange({ ...params, voice_ids: ids })
                    }}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="选择音色" />
                    </SelectTrigger>
                    <SelectContent>
                      {voices.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.name}（{v.style}）</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <Label>选择角色音色（{params.voice_ids.length}/{params.roles_count}）</Label>
            <p className="text-sm text-muted-foreground">
              需选择与角色数量相同的音色后才能进入下一步
            </p>
            {voicesIncomplete && (
              <p className="text-sm text-destructive">
                请选满 {params.roles_count} 个音色（已选 {params.voice_ids.length}）
              </p>
            )}
            <VoicePicker
              selected={params.voice_ids}
              onChange={(ids) => update({ voice_ids: ids })}
              maxCount={params.roles_count}
            />
          </>
        )}
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
