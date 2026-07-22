'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  parseShowNotes,
  formatShowNotesForCopy,
  type ShowNotesPayload,
} from '@/lib/services/show-notes'

interface Props {
  showNotes: string | null
  coverSuggestion: string | null
}

export function ShowNotes({ showNotes, coverSuggestion }: Props) {
  const parsed = useMemo(() => parseShowNotes(showNotes), [showNotes])

  if (!parsed && !coverSuggestion) {
    return <p className="text-sm text-muted-foreground">后处理完成后自动生成</p>
  }

  if (parsed && 'plain' in parsed) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">节目简介</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{parsed.plain}</p>
          </CardContent>
        </Card>
        {coverSuggestion && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">封面建议</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{coverSuggestion}</p>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  const data = parsed as ShowNotesPayload | null

  return (
    <div className="space-y-4">
      {data && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(formatShowNotesForCopy(data))}
          >
            复制全部
          </Button>
        </div>
      )}
      {data?.summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">节目简介</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{data.summary}</p>
          </CardContent>
        </Card>
      )}
      {data && data.highlights.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">要点</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {data.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {data && data.chapters.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">章节</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.chapters.map((ch, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-muted-foreground font-mono w-14">{ch.time}</span>
                <span>{ch.title}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {coverSuggestion && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">封面建议</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{coverSuggestion}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
