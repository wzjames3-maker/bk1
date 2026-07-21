import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/services/stripe'
import { topup } from '@/lib/services/billing'
import { createAdminClient } from '@/lib/supabase/admin'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.user_id
    const amountTotal = (session.amount_total || 0) / 100 // cents → dollars
    const paymentIntent = session.payment_intent as string

    if (userId && amountTotal > 0 && paymentIntent) {
      // 幂等性检查：确认该 payment_intent 未被处理过
      const admin = createAdminClient()
      const { data: existing } = await admin
        .from('transactions')
        .select('id')
        .eq('stripe_payment_id', paymentIntent)
        .maybeSingle()

      if (!existing) {
        await topup(userId, amountTotal, paymentIntent)
      }
    }
  }

  return NextResponse.json({ received: true })
}
