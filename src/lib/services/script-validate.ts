import type { ScriptSegment } from '@/types/database'

const NOISE_TEXT_RE = /^[-—_=*#\s]+$/
const NOISE_ROLE_RE = /[*#>[\]]/

export function validateSegments(segments: unknown): segments is ScriptSegment[] {
  if (!Array.isArray(segments) || segments.length === 0) return false
  for (const seg of segments) {
    if (typeof seg !== 'object' || seg === null) return false
    const s = seg as Record<string, unknown>
    if (typeof s.role !== 'string' || !s.role.trim()) return false
    if (typeof s.text !== 'string' || !s.text.trim()) return false
  }
  return true
}

export function normalizeSegments(raw: ScriptSegment[]): ScriptSegment[] {
  return raw
    .map(s => ({
      role: String(s.role || '主播').trim(),
      text: String(s.text || '').trim(),
      emotion: String(s.emotion || '中性'),
      pause_ms: Math.min(1000, Math.max(200, Number(s.pause_ms) || 300)),
    }))
    .filter(s => {
      if (!s.text || NOISE_TEXT_RE.test(s.text)) return false
      if (NOISE_ROLE_RE.test(s.role)) return false
      if (s.role.length > 10) return false
      return true
    })
}

export function validateFinal(segments: ScriptSegment[]): boolean {
  if (segments.length === 0) return false
  const roles = new Set(segments.map(s => s.role))
  if (roles.size > 5) return false
  return true
}
