'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BalanceCard } from './balance-card'
import { TransactionList } from './transaction-list'
import { UsageList } from './usage-list'
import type { Transaction, UsageLog } from '@/types/database'

interface BillingData {
  balance: number
  transactions: Transaction[]
  txTotal: number
  usage: UsageLog[]
  usageTotal: number
  page: number
  pageSize: number
}

const TX_TYPES = [
  { value: '', label: '全部类型' },
  { value: 'charge', label: '扣费' },
  { value: 'refund', label: '退还' },
  { value: 'topup', label: '充值' },
]

// 快捷日期范围
const DATE_PRESETS = [
  { label: '今天', days: 0 },
  { label: '近7天', days: 7 },
  { label: '近30天', days: 30 },
  { label: '全部', days: -1 },
]

function getDateRange(days: number): { start: string; end: string } {
  const end = new Date().toISOString().slice(0, 10)
  if (days < 0) return { start: '', end: '' }
  if (days === 0) return { start: end, end }
  const d = new Date()
  d.setDate(d.getDate() - days)
  return { start: d.toISOString().slice(0, 10), end }
}

export function BillingDashboard() {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [txType, setTxType] = useState('')
  const [activePreset, setActivePreset] = useState(-1) // 默认"全部"

  const fetchData = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (startDate) params.set('start_date', startDate)
    if (endDate) params.set('end_date', endDate)
    if (txType) params.set('type', txType)

    try {
      const res = await fetch(`/api/billing/usage?${params}`)
      if (res.ok) {
        setData(await res.json())
      }
    } finally {
      setLoading(false)
    }
  }, [page, startDate, endDate, txType])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const applyPreset = (days: number) => {
    setActivePreset(days)
    const { start, end } = getDateRange(days)
    setStartDate(start)
    setEndDate(end)
    setPage(1)
  }

  const totalPages = data ? Math.max(1, Math.ceil(Math.max(data.txTotal, data.usageTotal) / data.pageSize)) : 1

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">账单中心</h1>
      <BalanceCard balance={data?.balance ?? 0} />

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 快捷日期 */}
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {DATE_PRESETS.map(p => (
            <Button
              key={p.days}
              size="sm"
              variant={activePreset === p.days ? 'default' : 'ghost'}
              className="h-7 px-2 text-xs"
              onClick={() => applyPreset(p.days)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {/* 自定义日期 */}
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="h-8 w-36"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setActivePreset(-2); setPage(1) }}
          />
          <span className="text-muted-foreground">至</span>
          <Input
            type="date"
            className="h-8 w-36"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setActivePreset(-2); setPage(1) }}
          />
        </div>

        {/* 类型筛选 */}
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={txType}
          onChange={e => { setTxType(e.target.value); setPage(1) }}
        >
          {TX_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* 内容区 */}
      {loading ? (
        <div className="flex justify-center py-12 text-muted-foreground">加载中...</div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">交易记录（{data?.txTotal ?? 0}）</CardTitle>
              </CardHeader>
              <CardContent>
                <TransactionList transactions={data?.transactions ?? []} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">用量明细（{data?.usageTotal ?? 0}）</CardTitle>
              </CardHeader>
              <CardContent>
                <UsageList usage={data?.usage ?? []} />
              </CardContent>
            </Card>
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
