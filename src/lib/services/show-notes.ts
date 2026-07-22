export interface ShowNotesPayload {
  summary: string
  highlights: string[]
  chapters: Array<{ time: string; title: string }>
}

export function parseShowNotes(
  raw: string | null | undefined
): ShowNotesPayload | { plain: string } | null {
  if (!raw || !raw.trim()) return null
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && typeof obj.summary === 'string') {
      return {
        summary: obj.summary,
        highlights: Array.isArray(obj.highlights) ? obj.highlights.map(String) : [],
        chapters: Array.isArray(obj.chapters)
          ? obj.chapters.map((c: { time?: string; title?: string }) => ({
              time: String(c.time || ''),
              title: String(c.title || ''),
            }))
          : [],
      }
    }
  } catch {
    // fallthrough
  }
  return { plain: raw }
}

export function serializeShowNotes(payload: ShowNotesPayload): string {
  return JSON.stringify(payload)
}

export function formatShowNotesForCopy(payload: ShowNotesPayload): string {
  const lines = [
    payload.summary,
    '',
    '要点：',
    ...payload.highlights.map((h, i) => `${i + 1}. ${h}`),
  ]
  if (payload.chapters.length) {
    lines.push('', '章节：')
    for (const ch of payload.chapters) {
      lines.push(`${ch.time} ${ch.title}`)
    }
  }
  return lines.join('\n')
}
