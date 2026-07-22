export type PodcastStyle = 'casual' | 'deep' | 'news' | 'story'

export const FORBIDDEN_PHRASES = [
  '综上所述',
  '首先其次再次',
  '赋能',
  '抓手',
  '闭环',
  '旨在',
  '具有重要意义',
] as const

const PRESETS: Record<
  PodcastStyle,
  { label: string; factor: number; rules: string }
> = {
  casual: {
    label: '轻松闲聊',
    factor: 1.0,
    rules: '轻松闲聊：短句、语气词、接梗/吐槽；像朋友聊天，少正式过渡。',
  },
  deep: {
    label: '深度对谈',
    factor: 1.1,
    rules: '深度对谈：追问「为什么/怎么做」；有论点与反例；少口号。',
  },
  news: {
    label: '新闻播报',
    factor: 0.9,
    rules: '新闻播报：先结论后背景；信息密度高；少口头禅与闲扯。',
  },
  story: {
    label: '故事叙述',
    factor: 1.15,
    rules: '故事叙述：有场景与情绪弧；用细节带人；结尾收束主题。',
  },
}

export function normalizeStyle(style: string): PodcastStyle {
  if (style in PRESETS) return style as PodcastStyle
  return 'casual'
}

export function getStylePreset(style: string) {
  return PRESETS[normalizeStyle(style)]
}

export function targetCharCount(durationMin: number, style: string): number {
  const { factor } = getStylePreset(style)
  return Math.round(durationMin * 250 * factor)
}

export function buildStyleSystemAppendix(style: string): string {
  const preset = getStylePreset(style)
  const banned = FORBIDDEN_PHRASES.join('、')
  return `
风格（${preset.label}）：
${preset.rules}

口语硬规则：
- 禁止或尽量避免：${banned}
- 鼓励接话、反问、举例；pause_ms 200-1000 控制节奏
- 严格按角色名说话，不要发明新角色名`
}
