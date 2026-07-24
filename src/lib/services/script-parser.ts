import type { ScriptSegment } from '@/types/database'

const STRUCTURED_LINE_RE = /^(.{1,10})[：:]\s*(.+)$/

export function parseScript(raw: string): ScriptSegment[] {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  if (isStructured(lines)) {
    return parseStructured(lines)
  }
  return parsePlainText(lines)
}

function isStructured(lines: string[]): boolean {
  const matches = lines.map(l => STRUCTURED_LINE_RE.exec(l)).filter(Boolean)
  if (matches.length / lines.length < 0.6) return false

  const roles = new Map<string, number>()
  for (const m of matches) {
    const role = m![1].trim()
    roles.set(role, (roles.get(role) || 0) + 1)
  }
  if (roles.size > 5) return false
  for (const count of roles.values()) {
    if (count < 2) return false
  }
  return true
}

function parseStructured(lines: string[]): ScriptSegment[] {
  const segments: ScriptSegment[] = []
  for (const line of lines) {
    const m = STRUCTURED_LINE_RE.exec(line)
    if (!m) continue
    segments.push({
      role: m[1].trim(),
      text: m[2].trim(),
      emotion: '中性',
      pause_ms: 300,
    })
  }
  return segments
}

function parsePlainText(lines: string[]): ScriptSegment[] {
  const segments: ScriptSegment[] = []
  for (const line of lines) {
    const chunks = splitLongText(line, 200)
    for (const chunk of chunks) {
      segments.push({
        role: '主播',
        text: chunk,
        emotion: '中性',
        pause_ms: 300,
      })
    }
  }
  return segments
}

function splitLongText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  const sentences = text.split(/(?<=[。？！?!])/)
  let current = ''
  for (const s of sentences) {
    if ((current + s).length > maxLen && current) {
      chunks.push(current.trim())
      current = s
    } else {
      current += s
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}
