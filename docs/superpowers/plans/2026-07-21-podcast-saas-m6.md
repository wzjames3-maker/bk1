# M6：打磨（落地页 + PostHog + Sentry + 部署）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 完成产品打磨——增强落地页转化率、集成 PostHog 产品分析、集成 Sentry 错误监控、配置 Vercel 部署。

**架构：** 落地页为纯静态 Server Component（无 Supabase 依赖，可 SSG）；PostHog 通过 `posthog-js` 在客户端 Provider 中初始化；Sentry 通过 `@sentry/nextjs` 在客户端和服务端同时捕获异常；Vercel 部署通过 `vercel.json` 配置。

**技术栈：** Next.js 16, posthog-js, @sentry/nextjs, Vercel

**前置依赖：** M1-M5 已完成

---

## 文件结构

```
├── src/
│   ├── app/
│   │   ├── page.tsx                          # 落地页（覆盖，增强版）
│   │   ├── layout.tsx                        # 根布局（添加 PostHog Provider）
│   │   └── global-error.tsx                  # Sentry 全局错误边界
│   ├── components/
│   │   └── landing/
│   │       ├── hero.tsx                      # Hero 区域
│   │       ├── features.tsx                  # 功能展示
│   │       ├── how-it-works.tsx              # 流程说明
│   │       └── pricing.tsx                   # 定价说明
│   └── lib/
│       └── posthog.ts                        # PostHog 客户端初始化
├── sentry.client.config.ts                   # Sentry 客户端配置
├── sentry.server.config.ts                   # Sentry 服务端配置
└── vercel.json                               # Vercel 部署配置
```

---

## 全局约束

- 落地页为纯静态（不依赖 Supabase），可被 Next.js SSG 预渲染
- PostHog 仅在客户端运行，使用 `NEXT_PUBLIC_POSTHOG_KEY` 环境变量
- Sentry DSN 使用 `SENTRY_DSN` 环境变量，未配置时静默禁用
- 环境变量：`NEXT_PUBLIC_POSTHOG_KEY`、`SENTRY_DSN`
- 落地页不需要 `force-dynamic`（纯静态内容）

---

### 任务 1：增强落地页

**文件：**
- 创建：`src/components/landing/hero.tsx`, `src/components/landing/features.tsx`, `src/components/landing/how-it-works.tsx`, `src/components/landing/pricing.tsx`
- 覆盖：`src/app/page.tsx`

- [ ] **步骤 1：创建 Hero 组件 `src/components/landing/hero.tsx`**

```typescript
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="flex flex-col items-center justify-center gap-8 py-24 text-center">
      <div className="space-y-4">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          🎧 PodCast AI
        </h1>
        <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
          输入素材和话题，AI 自动生成多人对话式播客。
          从编剧到配音到混音，全自动完成。
        </p>
      </div>
      <div className="flex gap-4">
        <Link href="/login">
          <Button size="lg">免费开始（赠送 $1）</Button>
        </Link>
        <Link href="/login">
          <Button size="lg" variant="outline">登录</Button>
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        无需信用卡 · 注册即送 $1 体验金 · 一期播客低至 $0.25
      </p>
    </section>
  )
}
```

- [ ] **步骤 2：创建功能展示 `src/components/landing/features.tsx`**

```typescript
const FEATURES = [
  {
    icon: '📄',
    title: '素材解析',
    description: '支持 PDF、网页链接、Word 文档、纯文本，自动提取核心内容。',
  },
  {
    icon: '✍️',
    title: 'AI 编剧',
    description: 'DeepSeek 大模型将素材改编为自然流畅的多人对话脚本。',
  },
  {
    icon: '🎙️',
    title: '多角色配音',
    description: '预设多种 AI 声音，按角色自动分配，支持情绪表达。',
  },
  {
    icon: '🎵',
    title: '智能混音',
    description: '自动拼接、添加转场和背景音乐，输出成品级音频。',
  },
  {
    icon: '📝',
    title: 'Show Notes',
    description: '自动生成节目简介、时间戳章节、封面建议。',
  },
  {
    icon: '⚡',
    title: '按量付费',
    description: '用多少付多少，一期 10 分钟播客仅需 $0.25 ~ $0.50。',
  },
]

export function Features() {
  return (
    <section className="py-16">
      <h2 className="mb-12 text-center text-3xl font-bold">一站式播客生产</h2>
      <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(f => (
          <div key={f.title} className="space-y-2 rounded-lg border p-6">
            <span className="text-3xl">{f.icon}</span>
            <h3 className="text-lg font-semibold">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **步骤 3：创建流程说明 `src/components/landing/how-it-works.tsx`**

```typescript
const STEPS = [
  { step: '1', title: '上传素材', description: '粘贴文章链接、上传 PDF/Word，或直接输入文本和话题。' },
  { step: '2', title: 'AI 编剧', description: '系统自动生成多人对话脚本，你可以预览和编辑。' },
  { step: '3', title: '一键合成', description: '确认后自动配音、混音，几分钟后即可下载成品播客。' },
]

export function HowItWorks() {
  return (
    <section className="bg-muted/40 py-16">
      <h2 className="mb-12 text-center text-3xl font-bold">三步出片</h2>
      <div className="mx-auto flex max-w-4xl flex-col gap-8 sm:flex-row">
        {STEPS.map(s => (
          <div key={s.step} className="flex-1 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
              {s.step}
            </div>
            <h3 className="text-lg font-semibold">{s.title}</h3>
            <p className="text-sm text-muted-foreground">{s.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **步骤 4：创建定价说明 `src/components/landing/pricing.tsx`**

```typescript
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const PRICING_ITEMS = [
  { label: 'LLM 编剧', price: '$0.002 / 1K tokens' },
  { label: 'TTS 配音', price: '$0.015 / 1K 字符' },
  { label: '混音处理', price: '$0.01 / 期' },
  { label: '音频存储', price: '$0.02 / GB / 月' },
]

export function Pricing() {
  return (
    <section className="py-16">
      <h2 className="mb-4 text-center text-3xl font-bold">透明定价</h2>
      <p className="mb-12 text-center text-muted-foreground">
        按量付费，用多少算多少。注册即送 $1 体验金。
      </p>
      <div className="mx-auto max-w-md space-y-3 rounded-lg border p-6">
        {PRICING_ITEMS.map(item => (
          <div key={item.label} className="flex justify-between text-sm">
            <span>{item.label}</span>
            <span className="font-medium">{item.price}</span>
          </div>
        ))}
        <div className="border-t pt-3 mt-3">
          <p className="text-sm text-muted-foreground text-center">
            一期 10 分钟播客预估费用：<span className="font-semibold text-foreground">$0.25 ~ $0.50</span>
          </p>
        </div>
      </div>
      <div className="mt-8 text-center">
        <Link href="/login">
          <Button size="lg">免费试用</Button>
        </Link>
      </div>
    </section>
  )
}
```

- [ ] **步骤 5：覆盖落地页 `src/app/page.tsx`**

```typescript
import { Hero } from '@/components/landing/hero'
import { Features } from '@/components/landing/features'
import { HowItWorks } from '@/components/landing/how-it-works'
import { Pricing } from '@/components/landing/pricing'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40">
      <main className="mx-auto max-w-6xl px-4">
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
      </main>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © 2026 PodCast AI · 自动化播客生产平台
      </footer>
    </div>
  )
}
```

- [ ] **步骤 6：Commit**

```bash
git add -A
git commit -m "feat: enhance landing page with features, how-it-works, and pricing"
```

---

### 任务 2：PostHog 产品分析

**文件：**
- 创建：`src/lib/posthog.ts`, `src/components/posthog-provider.tsx`
- 修改：`src/app/layout.tsx`

- [ ] **步骤 1：安装 PostHog**

```bash
npm install posthog-js
```

- [ ] **步骤 2：创建 PostHog 初始化 `src/lib/posthog.ts`**

```typescript
import posthog from 'posthog-js'

export function initPostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return

  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
  })
}

export { posthog }
```

- [ ] **步骤 3：创建 PostHog Provider `src/components/posthog-provider.tsx`**

```typescript
'use client'

import { useEffect } from 'react'
import { initPostHog } from '@/lib/posthog'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog()
  }, [])

  return <>{children}</>
}
```

- [ ] **步骤 4：修改根布局 `src/app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { PostHogProvider } from '@/components/posthog-provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PodCast AI - 自动化播客生产平台',
  description: '输入素材和话题，AI 自动生成多人对话式播客',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
```

- [ ] **步骤 5：Commit**

```bash
git add -A
git commit -m "feat: add PostHog analytics integration"
```

---

### 任务 3：Sentry 错误监控

**文件：**
- 创建：`sentry.client.config.ts`, `sentry.server.config.ts`, `src/app/global-error.tsx`

- [ ] **步骤 1：安装 Sentry**

```bash
npm install @sentry/nextjs
```

- [ ] **步骤 2：创建客户端配置 `sentry.client.config.ts`**

```typescript
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}
```

- [ ] **步骤 3：创建服务端配置 `sentry.server.config.ts`**

```typescript
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  })
}
```

- [ ] **步骤 4：创建全局错误边界 `src/app/global-error.tsx`**

```typescript
'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <h2 className="text-2xl font-bold">出错了</h2>
          <p className="text-muted-foreground">抱歉，页面遇到了问题。</p>
          <button
            onClick={() => reset()}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            重试
          </button>
        </div>
      </body>
    </html>
  )
}
```

- [ ] **步骤 5：Commit**

```bash
git add -A
git commit -m "feat: add Sentry error monitoring"
```

---

### 任务 4：Vercel 部署配置

**文件：**
- 创建：`vercel.json`

- [ ] **步骤 1：创建 Vercel 配置 `vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs"
}
```

- [ ] **步骤 2：Commit**

```bash
git add -A
git commit -m "feat: add Vercel deployment config"
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
预期：构建成功，落地页 `/` 为 Static（SSG）。

- [ ] **步骤 3：验证路由**

确认 `/` 路由为 Static（预渲染），其余路由为 Dynamic。

- [ ] **步骤 4：Commit 修复（如有）**

```bash
git add -A
git commit -m "fix: resolve M6 integration issues"
```

---

## M6 完成标准

- [ ] 落地页：Hero + 功能展示 + 流程说明 + 定价 + CTA + Footer
- [ ] 落地页为静态预渲染（SSG），无 Supabase 依赖
- [ ] PostHog：客户端初始化 + 自动页面浏览追踪
- [ ] Sentry：客户端 + 服务端配置 + 全局错误边界
- [ ] Sentry/PostHog 未配置环境变量时静默禁用（不报错）
- [ ] Vercel 部署配置就绪
- [ ] TypeScript 无类型错误
- [ ] `npm run build` 通过

---

## 项目完成

M6 完成后，MVP 全部 6 个里程碑交付完毕：
- M1：项目初始化 + Auth + 基础布局 + DB Schema ✅
- M2：创建流程（素材上传 + 参数设置 + 费用预估）✅
- M3：Pipeline 核心（编剧 + TTS + 混音 + 状态机）✅
- M4：剧集详情（播放器 + 脚本编辑 + 进度追踪）✅
- M5：计费（Stripe 充值 + 按量扣费 + 账单页）✅
- M6：打磨（落地页 + PostHog + Sentry + 部署）