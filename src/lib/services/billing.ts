import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 预扣余额（创建 episode 时调用）
 * 使用原子操作：只有余额 >= amount 时才扣减
 * 返回 true 表示扣费成功，false 表示余额不足
 */
export async function preCharge(
  userId: string,
  amount: number,
  episodeId: string
): Promise<boolean> {
  const admin = createAdminClient()

  // 原子扣减：余额不足时返回空
  const { data, error } = await admin.rpc('deduct_if_sufficient', {
    uid: userId,
    amount,
  })

  if (error || data === null) {
    return false
  }

  // 记录交易
  await admin.from('transactions').insert({
    user_id: userId,
    type: 'charge',
    amount: -amount,
    description: `预扣：${episodeId}`,
  })

  return true
}

/**
 * 结算（episode 完成时调用）
 * 按 actual_cost 结算，多退少补
 * 注：MVP 阶段 actual_cost = estimated_cost，settle 为 no-op；逻辑已就位供后续精确计费使用
 */
export async function settle(
  userId: string,
  episodeId: string,
  estimatedCost: number,
  actualCost: number
): Promise<void> {
  const admin = createAdminClient()
  const diff = estimatedCost - actualCost

  if (diff === 0) return

  // diff > 0: 多扣了，退还差额；diff < 0: 少扣了，补扣差额
  await admin.rpc('adjust_balance', { uid: userId, delta: diff })

  await admin.from('transactions').insert({
    user_id: userId,
    type: diff > 0 ? 'refund' : 'charge',
    amount: diff,
    description: diff > 0
      ? `结算退还：${episodeId}（预估$${estimatedCost.toFixed(4)} → 实际$${actualCost.toFixed(4)}）`
      : `结算补扣：${episodeId}（预估$${estimatedCost.toFixed(4)} → 实际$${actualCost.toFixed(4)}）`,
  })
}

/**
 * 全额退还（episode 失败时调用）
 */
export async function refund(
  userId: string,
  episodeId: string,
  amount: number
): Promise<void> {
  const admin = createAdminClient()

  await admin.rpc('adjust_balance', { uid: userId, delta: amount })

  await admin.from('transactions').insert({
    user_id: userId,
    type: 'refund',
    amount: amount,
    description: `失败退还：${episodeId}`,
  })
}

/**
 * 充值到账（Stripe Webhook 调用）
 */
export async function topup(
  userId: string,
  amount: number,
  stripePaymentId: string
): Promise<void> {
  const admin = createAdminClient()

  await admin.rpc('adjust_balance', { uid: userId, delta: amount })

  await admin.from('transactions').insert({
    user_id: userId,
    type: 'topup',
    amount: amount,
    stripe_payment_id: stripePaymentId,
    description: `充值 $${amount.toFixed(2)}`,
  })
}
