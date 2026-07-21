'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Transaction } from '@/types/database'

interface Props {
  transactions: Transaction[]
}

const TYPE_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  charge: { label: '扣费', variant: 'destructive' },
  refund: { label: '退还', variant: 'secondary' },
  topup: { label: '充值', variant: 'default' },
}

export function TransactionList({ transactions }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">交易记录</CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无交易记录</p>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => {
              const info = TYPE_LABELS[tx.type] || { label: tx.type, variant: 'outline' as const }
              return (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant={info.variant}>{info.label}</Badge>
                      <span className="text-sm">{tx.description}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <span className={`text-sm font-medium ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(4)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
