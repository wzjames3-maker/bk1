import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export const TOPUP_TIERS = [
  { id: 'tier_5', amount: 500, label: '$5' },
  { id: 'tier_10', amount: 1000, label: '$10' },
  { id: 'tier_20', amount: 2000, label: '$20' },
] as const

export type TierId = (typeof TOPUP_TIERS)[number]['id']

export function getTierById(id: string) {
  return TOPUP_TIERS.find(t => t.id === id)
}
