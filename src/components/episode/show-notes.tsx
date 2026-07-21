'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  showNotes: string | null
  chapters: Array<{ time: string; title: string }> | null
  coverSuggestion: string | null
}

export function ShowNotes({ showNotes, chapters, coverSuggestion }: Props) {
  return (
    <div className="space-y-4">
      {showNotes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">节目简介</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{showNotes}</p>
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

      {!showNotes && !coverSuggestion && (
        <p className="text-sm text-muted-foreground">后处理完成后自动生成</p>
      )}
    </div>
  )
}
