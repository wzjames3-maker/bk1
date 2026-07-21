import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }
  return _stripe
}

// 兼容已有 import { stripe } 的写法
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return Reflect.get(getStripe(), prop)
  },
})

export const TOPUP_TIERS = [
  { id: 'tier_5', amount: 500, label: '$5' },
  { id: 'tier_10', amount: 1000, label: '$10' },
  { id: 'tier_20', amount: 2000, label: '$20' },
] as const

export type TierId = (typeof TOPUP_TIERS)[number]['id']

export function getTierById(id: string) {
  return TOPUP_TIERS.find(t => t.id === id)
}
