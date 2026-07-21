# M5：计费（Stripe 充值 + 按量扣费 + 账单页）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现完整的计费系统——Stripe 充值、创建时预扣余额、完成时按实际结算、失败全额退还、以及账单中心页面。

**架构：** Stripe Checkout Session 处理充值（$5/$10/$20），Webhook 回调更新余额；计费服务封装预扣/结算/退还逻辑（使用 Supabase Service Role 绕过 RLS）；Pipeline 完成/失败时自动触发结算/退还；账单中心展示余额、交易记录和用量明细。

**技术栈：** Next.js 16, Stripe SDK (`stripe`), Supabase Admin Client, shadcn/ui

**前置依赖：** M1-M4 已完成

---

## 文件结构

```
├── src/
│   ├── app/
│   │   ├── (app)/billing/page.tsx              # 账单中心页面（覆盖占位）
│   │   └── api/billing/
│   │       ├── estimate/route.ts               # 已有（费用预估）
│   │       ├── checkout/route.ts               # Stripe 充值会话
│   │       ├── webhook/route.ts                # Stripe Webhook
│   │       └── usage/route.ts                  # 用量 + 交易明细
│   ├── components/
│   │   └── billing/
│   │       ├── balance-card.tsx                # 余额卡片 + 充值按钮
│   │       ├── transaction-list.tsx            # 交易记录列表
│   │       └── usage-list.tsx                  # 用量明细列表
│   ├── lib/
│   │   └── services/
│   │       ├── stripe.ts                       # Stripe 客户端 + 配置
│   │       └── billing.ts                      # 预扣/结算/退还逻辑
│   └── types/database.ts                       # 已有 Transaction/UsageLog 类型
```

---

## 全局约束

- 计费模式：预充值余额 + 按量扣费
- 充值档位：$5 / $10 / $20（固定，不支持自定义金额）
- 扣费时机：创建时预扣 estimated_cost → 完成时按 actual_cost 结算（多退少补）→ 失败全额退还
- 所有余额操作使用 Supabase Admin Client（绕过 RLS），确保原子性
- Stripe Webhook 必须验证签名（`constructEvent`）
- Webhook 路由不能使用 `createClient()`（无用户会话），使用 `createAdminClient()`
- 注册赠送 $1 体验金（在 profiles 表 trigger 中处理，不在本计划范围）
- 环境变量：`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

---

### 任务 1：Stripe 服务 + 计费服务

**文件：**
- 创建：`src/lib/services/stripe.ts`, `src/lib/services/billing.ts`

- [ ] **步骤 1：安装 Stripe SDK**

```bash
npm install stripe
```

- [ ] **步骤 2：创建 Stripe 服务 `src/lib/services/stripe.ts`**

```typescript
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
```

- [ ] **步骤 3：创建余额原子操作 SQL 函数**

在 Supabase Dashboard → SQL Editor 执行：

```sql
create or replace function adjust_balance(uid uuid, delta numeric)
returns numeric
language sql
security definer
as $$
  update profiles set balance = balance + delta where id = uid returning balance;
$$;

create or replace function deduct_if_sufficient(uid uuid, amount numeric)
returns numeric
language sql
security definer
as $$
  update profiles set balance = balance - amount where id = uid and balance >= amount returning balance;
$$;
```

- [ ] **步骤 4：创建计费服务 `src/lib/services/billing.ts`**

```typescript
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
```

- [ ] **步骤 5：Commit**

```bash
git add -A
git commit -m "feat: add stripe and billing services"
```

---

### 任务 2：Stripe Checkout + Webhook API

**文件：**
- 创建：`src/app/api/billing/checkout/route.ts`, `src/app/api/billing/webhook/route.ts`

- [ ] **步骤 1：创建 Checkout API `src/app/api/billing/checkout/route.ts`**

```typescript
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
```

- [ ] **步骤 2：创建 Webhook API `src/app/api/billing/webhook/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/services/stripe'
import { topup } from '@/lib/services/billing'
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

    if (userId && amountTotal > 0) {
      await topup(userId, amountTotal, session.payment_intent as string)
    }
  }

  return NextResponse.json({ received: true })
}
```

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "feat: add stripe checkout and webhook APIs"
```

---

### 任务 3：Usage API + Pipeline 计费集成

**文件：**
- 创建：`src/app/api/billing/usage/route.ts`
- 修改：`src/app/api/episodes/route.ts`（POST 添加预扣）
- 修改：`src/lib/pipeline/orchestrator.ts`（完成/失败时结算/退还）

- [ ] **步骤 1：创建 Usage API `src/app/api/billing/usage/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '50')

  // 交易记录
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  // 用量明细
  const { data: usage } = await supabase
    .from('usage_records')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  // 当前余额
  const { data: profile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single()

  return NextResponse.json({
    balance: profile?.balance ?? 0,
    transactions: transactions || [],
    usage: usage || [],
  })
}
```

- [ ] **步骤 2：修改 Episode 创建 API 添加预扣 `src/app/api/episodes/route.ts`**

在 POST handler 中，`insert` 之前添加预扣逻辑：

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { preCharge, refund } from '@/lib/services/billing'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project_id')

  let query = supabase
    .from('episodes')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const estimatedCost = body.estimated_cost || 0

  // 先创建 episode
  const { data, error } = await supabase
    .from('episodes')
    .insert({
      user_id: user.id,
      project_id: body.project_id || null,
      topic: body.topic,
      params: body.params,
      materials: body.materials,
      title: body.title || null,
      estimated_cost: estimatedCost || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 预扣余额（使用真实 episode ID）
  if (estimatedCost > 0) {
    const charged = await preCharge(user.id, estimatedCost, data.id)
    if (!charged) {
      // 余额不足，删除刚创建的 episode
      await supabase.from('episodes').delete().eq('id', data.id)
      return NextResponse.json({ error: '余额不足，请先充值' }, { status: 402 })
    }
  }

  // 触发 pipeline 第一步（parsing）
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  fetch(`${baseUrl}/api/pipeline/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pipeline-secret': process.env.PIPELINE_INTERNAL_SECRET!,
    },
    body: JSON.stringify({
      episodeId: data.id,
      userId: user.id,
      step: 'parsing',
      attempt: 1,
    }),
  }).catch(() => {})

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **步骤 3：修改 Pipeline Orchestrator 添加结算/退还**

在 `src/lib/pipeline/orchestrator.ts` 的 `advancePipeline` 函数中：
- 当步骤为 `post_processing` 且执行成功（episode → completed）时，调用 `settle()`
- 当步骤执行失败（episode → failed）时，调用 `refund()`

在文件顶部添加 import：
```typescript
import { settle, refund } from '@/lib/services/billing'
```

在 `advancePipeline` 函数中，步骤执行成功后（`result.success === true`），如果 `nextStep === null`（即 pipeline 完成）：
```typescript
// Pipeline 完成 → 结算
if (!nextStep) {
  const { data: ep } = await admin
    .from('episodes')
    .select('estimated_cost, actual_cost, user_id')
    .eq('id', episodeId)
    .single()
  if (ep && ep.estimated_cost) {
    await settle(ep.user_id, episodeId, ep.estimated_cost, ep.actual_cost || ep.estimated_cost)
  }
}
```

在 catch 块中（步骤失败标记 episode 为 failed 后）：
```typescript
// Pipeline 失败 → 退还预扣
const { data: failedEp } = await admin
  .from('episodes')
  .select('estimated_cost, user_id')
  .eq('id', episodeId)
  .single()
if (failedEp && failedEp.estimated_cost) {
  await refund(failedEp.user_id, episodeId, failedEp.estimated_cost)
}
```

- [ ] **步骤 4：Commit**

```bash
git add -A
git commit -m "feat: add usage API and integrate billing into pipeline"
```

---

### 任务 4：账单中心页面

**文件：**
- 创建：`src/components/billing/balance-card.tsx`, `src/components/billing/transaction-list.tsx`, `src/components/billing/usage-list.tsx`
- 覆盖：`src/app/(app)/billing/page.tsx`

- [ ] **步骤 1：创建余额卡片 `src/components/billing/balance-card.tsx`**

```typescript
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
```

- [ ] **步骤 2：创建交易记录列表 `src/components/billing/transaction-list.tsx`**

```typescript
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
```

- [ ] **步骤 3：创建用量明细列表 `src/components/billing/usage-list.tsx`**

```typescript
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { UsageLog } from '@/types/database'

interface Props {
  usage: UsageLog[]
}

const TYPE_LABELS: Record<string, string> = {
  llm_token: 'LLM Token',
  tts_char: 'TTS 字符',
  storage_mb: '存储',
  mixing: '混音',
}

export function UsageList({ usage }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">用量明细</CardTitle>
      </CardHeader>
      <CardContent>
        {usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无用量记录</p>
        ) : (
          <div className="space-y-2">
            {usage.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">{TYPE_LABELS[item.type] || item.type}</span>
                  <p className="text-xs text-muted-foreground">
                    数量: {item.quantity.toLocaleString()} · {new Date(item.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">${item.cost.toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **步骤 4：覆盖账单中心页面 `src/app/(app)/billing/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BalanceCard } from '@/components/billing/balance-card'
import { TransactionList } from '@/components/billing/transaction-list'
import { UsageList } from '@/components/billing/usage-list'
import type { Transaction, UsageLog } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single()

  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: usage } = await supabase
    .from('usage_records')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">账单中心</h1>
      <BalanceCard balance={profile?.balance ?? 0} />
      <div className="grid gap-6 md:grid-cols-2">
        <TransactionList transactions={(transactions || []) as Transaction[]} />
        <UsageList usage={(usage || []) as UsageLog[]} />
      </div>
    </div>
  )
}
```

- [ ] **步骤 5：Commit**

```bash
git add -A
git commit -m "feat: add billing center page with balance, transactions, and usage"
```

---

### 任务 5：集成验证

- [ ] **步骤 1：运行 TypeScript 检查**

```bash
npx tsc --noEmit
```
预期：0 错误。

- [ ] **步骤 2：运行构建**

```bash
npm run build
```
预期：构建成功。

- [ ] **步骤 3：验证路由**

确认以下路由存在：
- `/api/billing/checkout` (Dynamic)
- `/api/billing/webhook` (Dynamic)
- `/api/billing/usage` (Dynamic)
- `/billing` (Dynamic)

- [ ] **步骤 4：Commit 修复（如有）**

```bash
git add -A
git commit -m "fix: resolve M5 integration issues"
```

---

## M5 完成标准

- [ ] Stripe Checkout：选择 $5/$10/$20 档位 → 跳转 Stripe 支付页
- [ ] Webhook：支付成功 → 余额到账 + 交易记录
- [ ] 创建 episode 时预扣 estimated_cost（余额不足返回 402）
- [ ] Pipeline 完成时按 actual_cost 结算（多退少补）
- [ ] Pipeline 失败时全额退还预扣金额
- [ ] GET /api/billing/usage 返回余额 + 交易 + 用量
- [ ] 账单中心页面：余额卡片 + 充值按钮 + 交易列表 + 用量明细
- [ ] TypeScript 无类型错误
- [ ] `npm run build` 通过

---

## 后续里程碑

- M6：打磨（落地页 + PostHog + Sentry + 部署）