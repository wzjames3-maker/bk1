# 产品打磨 Phase 2 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 完成暗色模式、表单校验增强、移动端适配、E2E 自动化测试四项产品打磨。

**架构：** 暗色模式使用已安装的 next-themes + 已有 CSS 变量；表单校验在 ScriptInput 组件内增加字数限制与提示；移动端适配将固定侧边栏改为可收起抽屉；E2E 使用已安装的 playwright 编写核心流程脚本。

**技术栈：** next-themes 0.4.6、Playwright 1.58.2、Tailwind CSS 4（dark variant 已配置）、shadcn/ui

---

## 文件结构

| 操作 | 路径 | 职责 |
|------|------|------|
| 修改 | `src/app/layout.tsx` | 包裹 ThemeProvider，html 加 suppressHydrationWarning |
| 创建 | `src/components/theme-toggle.tsx` | 暗色/亮色切换按钮 |
| 修改 | `src/components/sidebar.tsx` | 底部添加 ThemeToggle + 移动端抽屉化 |
| 修改 | `src/components/app-shell.tsx` | 移动端汉堡按钮 + 侧边栏 overlay |
| 修改 | `src/components/create/script-input.tsx` | 字数限制（50~10000）+ 实时计数 |
| 修改 | `src/components/create/create-wizard.tsx` | 脚本模式下一步校验字数 |
| 创建 | `e2e/auth.spec.ts` | 登录/登出 E2E |
| 创建 | `e2e/episodes.spec.ts` | 作品列表搜索/筛选/分页 E2E |
| 创建 | `e2e/create.spec.ts` | 创建向导流程 E2E |
| 创建 | `playwright.config.ts` | Playwright 配置 |

---

### 任务 1：暗色模式 — ThemeProvider + Toggle

**文件：**
- 修改：`src/app/layout.tsx`
- 创建：`src/components/theme-toggle.tsx`
- 修改：`src/components/sidebar.tsx`

- [ ] **步骤 1：修改根 layout 包裹 ThemeProvider**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
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
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <PostHogProvider>{children}</PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

- [ ] **步骤 2：创建 ThemeToggle 组件**

```tsx
// src/components/theme-toggle.tsx
'use client'

import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-3 text-muted-foreground"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      <span className="dark:hidden">🌙</span>
      <span className="hidden dark:inline">☀️</span>
      <span className="dark:hidden">深色模式</span>
      <span className="hidden dark:inline">浅色模式</span>
    </Button>
  )
}
```

- [ ] **步骤 3：在侧边栏底部添加 ThemeToggle**

在 `src/components/sidebar.tsx` 的退出登录按钮上方添加：

```tsx
import { ThemeToggle } from './theme-toggle'

// 在 <div className="border-t p-4"> 内部，退出登录按钮之前：
<ThemeToggle />
```

- [ ] **步骤 4：验证**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 5：Commit**

```bash
git add src/app/layout.tsx src/components/theme-toggle.tsx src/components/sidebar.tsx
git commit -m "feat: 暗色模式（ThemeProvider + 侧边栏切换按钮）"
```

---

### 任务 2：表单校验增强 — 脚本字数限制

**文件：**
- 修改：`src/components/create/script-input.tsx`
- 修改：`src/components/create/create-wizard.tsx`

- [ ] **步骤 1：ScriptInput 添加字数限制与实时计数**

在 `src/components/create/script-input.tsx` 中：

1. 在组件顶部添加常量：
```tsx
const MIN_CHARS = 50
const MAX_CHARS = 10000
```

2. Textarea 下方添加实时字数统计（在 `</Textarea>` 后的 `</div>` 之前）：
```tsx
<div className="flex justify-between text-xs text-muted-foreground">
  <span>{rawText.length > 0 && rawText.length < MIN_CHARS ? `至少 ${MIN_CHARS} 字` : ''}</span>
  <span className={rawText.length > MAX_CHARS ? 'text-destructive' : ''}>
    {rawText.length} / {MAX_CHARS}
  </span>
</div>
```

3. 解析按钮增加字数校验 disabled 条件：
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={handleParse}
  disabled={!rawText.trim() || parsing || rawText.length < MIN_CHARS || rawText.length > MAX_CHARS}
>
```

4. 超限时显示错误提示（在 parseError 之前）：
```tsx
{rawText.length > MAX_CHARS && (
  <p className="text-sm text-destructive">脚本超过 {MAX_CHARS} 字上限，请精简内容</p>
)}
```

- [ ] **步骤 2：CreateWizard 脚本模式下一步校验**

在 `src/components/create/create-wizard.tsx` 中，找到第一步「下一步」按钮的 disabled 逻辑，确保脚本模式下 segments 不为空：

```tsx
// 第一步下一步按钮的 disabled 条件应为：
disabled={
  mode === 'ai'
    ? !topic.trim()
    : segments.length === 0
}
```

并在点击下一步时，脚本模式增加 toast 提示：
```tsx
if (mode === 'script' && segments.length === 0) {
  toast.error('请先输入并解析脚本')
  return
}
```

- [ ] **步骤 3：验证**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add src/components/create/script-input.tsx src/components/create/create-wizard.tsx
git commit -m "feat: 脚本模式字数限制（50~10000）+ 实时计数"
```

---

### 任务 3：移动端适配 — 侧边栏抽屉化

**文件：**
- 修改：`src/components/app-shell.tsx`
- 修改：`src/components/sidebar.tsx`

- [ ] **步骤 1：AppShell 添加移动端汉堡菜单**

```tsx
// src/components/app-shell.tsx
'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { Button } from '@/components/ui/button'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏：桌面固定，移动端抽屉 */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transform transition-transform md:static md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <main className="flex-1 overflow-y-auto">
        {/* 移动端顶栏 */}
        <div className="flex h-14 items-center border-b px-4 md:hidden">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(true)}>
            ☰
          </Button>
          <span className="ml-3 font-bold">🎧 PodCast AI</span>
        </div>
        <div className="mx-auto max-w-6xl p-4 md:p-8">{children}</div>
      </main>
    </div>
  )
}
```

- [ ] **步骤 2：Sidebar 接受 onNavigate 回调**

修改 `src/components/sidebar.tsx`：

```tsx
interface SidebarProps {
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  // ... 现有代码

  // 在每个 Link 的 onClick 中调用 onNavigate：
  <Link key={item.href} href={item.href} onClick={onNavigate}>
```

- [ ] **步骤 3：验证**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 4：Commit**

```bash
git add src/components/app-shell.tsx src/components/sidebar.tsx
git commit -m "feat: 移动端适配（侧边栏抽屉 + 响应式内边距）"
```

---

### 任务 4：E2E 自动化测试 — Playwright 配置 + 核心用例

**文件：**
- 创建：`playwright.config.ts`
- 创建：`e2e/auth.spec.ts`
- 创建：`e2e/episodes.spec.ts`
- 创建：`e2e/create.spec.ts`

- [ ] **步骤 1：创建 Playwright 配置**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
})
```

- [ ] **步骤 2：创建登录 E2E**

```ts
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('认证', () => {
  test('登录成功跳转 Dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[type="email"]', 'wzjames3@gmail.com')
    await page.fill('input[type="password"]', '22090100114')
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('h1')).toContainText('你好')
  })

  test('未登录访问 /episodes 重定向到 /login', async ({ page }) => {
    await page.goto('/episodes')
    await expect(page).toHaveURL(/\/login/)
  })
})
```

- [ ] **步骤 3：创建作品列表 E2E**

```ts
// e2e/episodes.spec.ts
import { test, expect } from '@playwright/test'

// 先登录
test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'wzjames3@gmail.com')
  await page.fill('input[type="password"]', '22090100114')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/dashboard')
})

test.describe('作品列表', () => {
  test('列表正常渲染 + 搜索过滤', async ({ page }) => {
    await page.goto('/episodes')
    await expect(page.locator('h1')).toContainText('我的作品')
    // 搜索
    await page.fill('input[placeholder*="搜索"]', 'AI')
    await page.waitForTimeout(500) // 防抖
    const items = page.locator('[data-testid="episode-item"]')
    // 搜索结果应存在（至少 1 条）
    await expect(page.locator('text=AI').first()).toBeVisible()
  })

  test('状态筛选', async ({ page }) => {
    await page.goto('/episodes')
    await page.click('button:has-text("已完成")')
    await page.waitForTimeout(300)
    // 不应出现"失败"标签
    await expect(page.locator('text=失败')).toHaveCount(0)
  })
})
```

- [ ] **步骤 4：创建向导 E2E**

```ts
// e2e/create.spec.ts
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'wzjames3@gmail.com')
  await page.fill('input[type="password"]', '22090100114')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/dashboard')
})

test.describe('创建向导', () => {
  test('AI 模式：空话题不能下一步', async ({ page }) => {
    await page.goto('/create')
    const nextBtn = page.locator('button:has-text("下一步")')
    await expect(nextBtn).toBeDisabled()
  })

  test('脚本模式：字数不足不能解析', async ({ page }) => {
    await page.goto('/create')
    await page.click('button:has-text("脚本直传")')
    await page.fill('textarea', '太短了')
    const parseBtn = page.locator('button:has-text("解析预览")')
    await expect(parseBtn).toBeDisabled()
  })

  test('脚本模式：正常文本可解析', async ({ page }) => {
    await page.goto('/create')
    await page.click('button:has-text("脚本直传")')
    const script = '小林：大家好，欢迎收听本期节目。\n老陈：你好，今天聊什么话题？\n小林：我们聊聊人工智能的未来发展方向。'
    await page.fill('textarea', script)
    await page.click('button:has-text("解析预览")')
    await expect(page.locator('text=共')).toBeVisible({ timeout: 10000 })
  })
})
```

- [ ] **步骤 5：验证测试可运行**

运行：`npx playwright test e2e/auth.spec.ts --reporter=line`
预期：2 个测试通过（需 dev server 运行中）

- [ ] **步骤 6：Commit**

```bash
git add playwright.config.ts e2e/
git commit -m "test: Playwright E2E（登录、作品列表、创建向导）"
```

---

### 任务 5：最终验证 + 合并准备

- [ ] **步骤 1：全量类型检查**

运行：`npx tsc --noEmit`
预期：无错误

- [ ] **步骤 2：运行全部 E2E**

运行：`npx playwright test --reporter=line`
预期：所有测试通过

- [ ] **步骤 3：手动验证暗色模式**

启动 dev server → 点击侧边栏「🌙 深色模式」→ 全站切换为暗色 → 再点「☀️ 浅色模式」恢复

- [ ] **步骤 4：手动验证移动端**

Chrome DevTools → 切换为 iPhone 14 视口 → 侧边栏隐藏 → 点击 ☰ 弹出抽屉 → 点击导航项跳转 → 抽屉关闭
