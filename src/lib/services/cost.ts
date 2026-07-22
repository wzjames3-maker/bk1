// 单价配置（美元）
const PRICING = {
  llm_per_1k_tokens: 0.002,    // DeepSeek V4 Pro
  tts_per_1k_chars: 0.015,     // 阿里云/MiMo TTS
  mixing_per_episode: 0.01,    // 混音固定费
  storage_per_gb_month: 0.02,  // 存储月费
}

// 估算参数
const AVG_CHARS_PER_MINUTE = 250    // 中文播客每分钟约 250 字
const AVG_TOKENS_PER_CHAR = 1.5     // LLM 输入输出 token 比脚本字符数
const SCRIPT_OVERHEAD_RATIO = 1.3   // 编剧 prompt 开销系数

export interface CostEstimateInput {
  duration_min: number
  roles_count: number
  material_char_count: number
}

export interface CostEstimate {
  llm_cost: number
  tts_cost: number
  mixing_cost: number
  total: number
  breakdown: {
    estimated_script_chars: number
    estimated_llm_tokens: number
    estimated_tts_chars: number
  }
}

export function estimateCost(input: CostEstimateInput): CostEstimate {
  const { duration_min, material_char_count } = input

  // 估算脚本总字数 = 时长 × 每分钟字数
  const estimatedScriptChars = duration_min * AVG_CHARS_PER_MINUTE

  // LLM token 估算 = 脚本字数 × token 比率 × 开销系数 + 素材输入 token
  const estimatedLlmTokens =
    estimatedScriptChars * AVG_TOKENS_PER_CHAR * SCRIPT_OVERHEAD_RATIO +
    material_char_count * AVG_TOKENS_PER_CHAR

  // TTS 字符数 = 脚本总字数（每个角色加起来就是总脚本）
  const estimatedTtsChars = estimatedScriptChars

  const llmCost = (estimatedLlmTokens / 1000) * PRICING.llm_per_1k_tokens
  const ttsCost = (estimatedTtsChars / 1000) * PRICING.tts_per_1k_chars
  const mixingCost = PRICING.mixing_per_episode

  const total = llmCost + ttsCost + mixingCost

  return {
    llm_cost: Math.round(llmCost * 10000) / 10000,
    tts_cost: Math.round(ttsCost * 10000) / 10000,
    mixing_cost: mixingCost,
    total: Math.round(total * 10000) / 10000,
    breakdown: {
      estimated_script_chars: estimatedScriptChars,
      estimated_llm_tokens: Math.round(estimatedLlmTokens),
      estimated_tts_chars: estimatedTtsChars,
    },
  }
}
