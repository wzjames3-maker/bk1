'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Props {
  balance: number
}

const TIERS = [
  { id: 'tier_5', label: '$5' },
  { id: 'tier_10', label: '$10' },
  { id: 'tier_20', label: '$20' },
]

export function BalanceCard({ balance }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

  const handleTopup = async (tierId: string) => {
    setLoading(tierId)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier_id: tierId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">账户余额</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-3xl font-bold">${balance.toFixed(2)}</p>
        <div className="flex gap-2">
          {TIERS.map(tier => (
            <Button
              key={tier.id}
              variant="outline"
              size="sm"
              onClick={() => handleTopup(tier.id)}
              disabled={loading !== null}
            >
              {loading === tier.id ? '跳转中...' : `充值 ${tier.label}`}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
