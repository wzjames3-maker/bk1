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
  { label: string; factor: number; rules: string; ttsInstruction: string }
> = {
  casual: {
    label: '轻松闲聊',
    factor: 1.0,
    rules: '轻松闲聊：短句、语气词、接梗/吐槽；像朋友聊天，少正式过渡。',
    ttsInstruction:
      '轻松活泼的播客对谈风格，语速中等偏快，语调自然上扬，像朋友聊天一样松弛。带有轻微的笑意和好奇心，偶尔带点调侃的语气。',
  },
  deep: {
    label: '深度对谈',
    factor: 1.1,
    rules: '深度对谈：追问「为什么/怎么做」；有论点与反例；少口号。',
    ttsInstruction:
      '沉稳有深度的对谈风格，语速中等偏慢，语调平稳但有起伏。思考时略作停顿，强调观点时语气加重，整体从容不迫、有说服力。',
  },
  news: {
    label: '新闻播报',
    factor: 0.9,
    rules: '新闻播报：先结论后背景；信息密度高；少口头禅与闲扯。',
    ttsInstruction:
      '干练清晰的播报风格，语速中等，吐字精准，语调平稳专业。信息密度高，节奏紧凑，不带多余情绪，权威感强。',
  },
  story: {
    label: '故事叙述',
    factor: 1.15,
    rules: '故事叙述：有场景与情绪弧；用细节带人；结尾收束主题。',
    ttsInstruction:
      '有画面感的故事叙述风格，语速随情节起伏——紧张处加快，抒情处放慢。语调有层次，善用停顿制造悬念，声音温暖有感染力。',
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

export function getTtsInstruction(style: string): string {
  return PRESETS[normalizeStyle(style)].ttsInstruction
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
- 严格按角色名说话，不要发明新角色名

音频标签规则（嵌入 text 字段中，TTS 引擎会识别）：
- 在句子开头可加 (情绪/风格) 标签，如 (开心)、(慵懒)、(磁性)、(东北话)
- 在句中可插入 [动作] 标签，如 [笑]、[轻笑]、[深呼吸]、[叹气]、[哽咽]
- 标签要贴合语境，不要每句都加，大约 20%-30% 的句子使用即可
- 示例："(兴奋)哎你别说，这个思路真的绝了[笑]，我之前完全没想到。"`
}
