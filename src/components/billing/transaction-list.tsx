'use client'

import { Badge } from '@/components/ui/badge'
import type { Transaction } from '@/types/database'

const TYPE_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  charge: { label: '扣费', variant: 'destructive' },
  refund: { label: '退还', variant: 'secondary' },
  topup: { label: '充值', variant: 'default' },
}

export function TransactionList({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">暂无交易记录</p>
  }

  return (
    <div className="space-y-1">
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
  )
}
