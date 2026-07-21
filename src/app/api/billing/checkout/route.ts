import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { stripe, getTierById } from '@/lib/services/stripe'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tier_id } = await request.json()
  const tier = getTierById(tier_id)

  if (!tier) {
    return NextResponse.json({ error: 'Invalid tier_id' }, { status: 400 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `播客余额充值 ${tier.label}`,
          },
          unit_amount: tier.amount,
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/billing?success=true`,
    cancel_url: `${baseUrl}/billing?canceled=true`,
    metadata: {
      user_id: user.id,
      tier_id: tier.id,
    },
  })

  return NextResponse.json({ url: session.url })
}
