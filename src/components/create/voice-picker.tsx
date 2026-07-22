'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Voice } from '@/types/database'

interface Props {
  selected: string[]    // 选中的 voice id 列表
  onChange: (ids: string[]) => void
  maxCount: number
}

export function VoicePicker({ selected, onChange, maxCount }: Props) {
  const [voices, setVoices] = useState<Voice[]>([])

  useEffect(() => {
    fetch('/api/voices')
      .then(res => res.json())
      .then(setVoices)
      .catch(console.error)
  }, [])

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(v => v !== id))
    } else if (selected.length < maxCount) {
      onChange([...selected, id])
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {voices.map((voice) => {
        const isSelected = selected.includes(voice.id)
        const isDisabled = !isSelected && selected.length >= maxCount

        return (
          <Card
            key={voice.id}
            className={cn(
              'cursor-pointer transition-all',
              isSelected && 'border-primary ring-1 ring-primary',
              isDisabled && 'opacity-50 cursor-not-allowed'
            )}
            onClick={() => !isDisabled && toggle(voice.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {voice.gender === 'female' ? '👩' : '👨'} {voice.name}
                </span>
                {isSelected && <Badge variant="default">已选</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{voice.style}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {voice.provider === 'aliyun' ? '阿里云' : 'MiMo'}
              </p>
              {voice.sample_url && (
                <audio
                  src={voice.sample_url}
                  controls
                  className="mt-2 h-8 w-full"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
