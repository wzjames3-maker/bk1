# M1：项目初始化 + Auth + 基础布局 + DB Schema 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 搭建完整的 Next.js 项目骨架，集成 Supabase Auth，创建数据库 Schema，实现基础应用布局和登录注册流程。

**架构：** Next.js 15 App Router + shadcn/ui + Tailwind CSS 前端，Supabase 提供 Auth/DB/Storage，应用使用受保护的布局路由组。

**技术栈：** Next.js 15, TypeScript, shadcn/ui, Tailwind CSS, Supabase (Auth + Postgres), Zustand

---

## 文件结构

```
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── .env.local
├── .gitignore
├── components.json                    # shadcn/ui 配置
├── supabase/
│   ├── schema.sql                     # 完整数据库 DDL
│   └── seed.sql                       # 预设音色种子数据
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # 根布局（字体 + 全局样式）
│   │   ├── page.tsx                   # 落地页（简单占位）
│   │   ├── globals.css                # Tailwind 入口
│   │   ├── (auth)/
│   │   │   └── login/page.tsx         # 登录/注册页
│   │   └── (app)/
│   │       ├── layout.tsx             # 认证保护布局（侧边栏 + 顶栏）
│   │       ├── dashboard/page.tsx     # 工作台首页
│   │       ├── projects/page.tsx      # 项目列表（占位）
│   │       ├── create/page.tsx        # 创建页（占位）
│   │       ├── billing/page.tsx       # 账单页（占位）
│   │       └── settings/page.tsx      # 设置页（占位）
│   ├── components/
│   │   ├── ui/                        # shadcn/ui 组件（自动生成）
│   │   ├── app-shell.tsx              # 应用外壳（侧边栏 + 内容区）
│   │   ├── sidebar.tsx                # 侧边栏导航
│   │   └── auth-form.tsx              # 登录/注册表单
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # 浏览器端 Supabase 客户端
│   │   │   ├── server.ts             # 服务端 Supabase 客户端
│   │   │   └── middleware.ts         # Auth 中间件逻辑
│   │   └── utils.ts                   # cn() 工具函数
│   ├── middleware.ts                   # Next.js 中间件（路由保护）
│   └── types/
│       └── database.ts                # 数据库类型定义
```

---

### 任务 1：环境准备 + 项目初始化

**文件：**
- 创建：`package.json`, `next.config.ts`, `tsconfig.json`, `.gitignore`, `.env.local`

- [ ] **步骤 1：安装 Node.js 和 git（如未安装）**

确认环境：
```bash
node --version   # 需要 >= 20
npm --version
git --version
```
如未安装，从 https://nodejs.org 安装 Node.js 20 LTS，从 https://git-scm.com 安装 git。

- [ ] **步骤 2：初始化 git 仓库**

```bash
cd c:\Users\Administrator\qoder-cn\bk1
git init
```

- [ ] **步骤 3：使用 create-next-app 初始化项目**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```

- [ ] **步骤 4：安装核心依赖**

```bash
npm install @supabase/supabase-js @supabase/ssr zustand
npm install -D supabase
```

- [ ] **步骤 5：创建 .env.local**

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- [ ] **步骤 6：更新 .gitignore 追加条目**

```gitignore
# env
.env.local
.env*.local

# supabase
supabase/.branches
supabase/.temp
```

- [ ] **步骤 7：Commit**

```bash
git add -A
git commit -m "feat: initialize Next.js 15 project with TypeScript and Tailwind CSS"
```

---

### 任务 2：shadcn/ui 初始化

**文件：**
- 创建：`components.json`, `src/lib/utils.ts`, `src/components/ui/*`

- [ ] **步骤 1：初始化 shadcn/ui**

```bash
npx shadcn@latest init --yes
```
选择：New York 风格，Zinc 色系，CSS variables 启用。

- [ ] **步骤 2：安装常用组件**

```bash
npx shadcn@latest add button card input label tabs avatar dropdown-menu separator sheet badge dialog form select textarea toast sonner
```

- [ ] **步骤 3：验证 utils.ts 存在且包含 cn()**

确认 `src/lib/utils.ts` 包含：
```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **步骤 4：Commit**

```bash
git add -A
git commit -m "feat: add shadcn/ui with core components"
```

---

### 任务 3：Supabase 客户端 + Auth 中间件

**文件：**
- 创建：`src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/middleware.ts`

- [ ] **步骤 1：创建浏览器端客户端 `src/lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **步骤 2：创建服务端客户端 `src/lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // 从 Server Component 调用时忽略
          }
        },
      },
    }
  )
}
```

- [ ] **步骤 3：创建中间件逻辑 `src/lib/supabase/middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 受保护路由列表
  const protectedPaths = ['/dashboard', '/projects', '/create', '/billing', '/settings', '/episodes']
  const isProtected = protectedPaths.some(p => request.nextUrl.pathname.startsWith(p))

  // 未登录用户访问受保护路由 → 重定向到 /login
  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

- [ ] **步骤 4：创建 Next.js 中间件 `src/middleware.ts`**

```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **步骤 5：Commit**

```bash
git add -A
git commit -m "feat: add Supabase auth client and middleware"
```

---

### 任务 4：数据库 Schema

**文件：**
- 创建：`supabase/schema.sql`, `supabase/seed.sql`

- [ ] **步骤 1：创建 `supabase/schema.sql`**

```sql
-- 启用 UUID 扩展
create extension if not exists "uuid-ossp";

-- 用户业务扩展
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  avatar_url text,
  balance decimal(10,4) not null default 1.0000,  -- 注册赠送 $1
  created_at timestamptz not null default now()
);

-- 自动创建 profile
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 播客项目
create table projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  voice_config jsonb default '{}',
  bgm_config jsonb default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 单期节目
create table episodes (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete set null,
  user_id uuid not null references profiles(id) on delete cascade,
  title text,
  status text not null default 'pending'
    check (status in ('pending','parsing','scripting','script_ready',
                      'confirming','tts_processing','mixing',
                      'post_processing','completed','failed')),
  failed_at_step text,
  topic text not null,
  params jsonb not null default '{"duration_min":10,"style":"casual","roles_count":2}',
  materials jsonb default '[]',
  script jsonb,
  audio_url text,
  show_notes text,
  chapters jsonb,
  cover_url text,
  preview_url text,
  estimated_cost decimal(10,4),
  actual_cost decimal(10,4),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- 任务步骤日志
create table episode_steps (
  id uuid primary key default uuid_generate_v4(),
  episode_id uuid not null references episodes(id) on delete cascade,
  step text not null,
  status text not null default 'pending'
    check (status in ('pending','running','done','failed')),
  attempt int not null default 1,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz
);

-- 用量记录
create table usage_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  episode_id uuid references episodes(id) on delete set null,
  type text not null check (type in ('llm_token','tts_char','storage_mb','mixing')),
  quantity decimal not null,
  cost decimal(10,6) not null,
  created_at timestamptz not null default now()
);

-- 交易记录
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('charge','refund','topup')),
  amount decimal(10,4) not null,
  stripe_payment_id text,
  description text,
  created_at timestamptz not null default now()
);

-- 预设音色
create table voices (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  gender text not null check (gender in ('male','female')),
  style text not null,
  provider text not null check (provider in ('aliyun','mimo')),
  provider_voice_id text not null,
  sample_url text,
  is_active boolean not null default true
);

-- RLS 策略
alter table profiles enable row level security;
alter table projects enable row level security;
alter table episodes enable row level security;
alter table episode_steps enable row level security;
alter table usage_logs enable row level security;
alter table transactions enable row level security;
alter table voices enable row level security;

-- profiles: 用户只能读写自己的
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

-- projects: 用户 CRUD 自己的
create policy "Users can CRUD own projects" on projects
  for all using (auth.uid() = user_id);

-- episodes: 用户 CRUD 自己的
create policy "Users can CRUD own episodes" on episodes
  for all using (auth.uid() = user_id);

-- episode_steps: 通过 episode 关联
create policy "Users can view own episode steps" on episode_steps
  for select using (
    exists (select 1 from episodes where episodes.id = episode_id and episodes.user_id = auth.uid())
  );

-- usage_logs: 用户查看自己的
create policy "Users can view own usage" on usage_logs
  for select using (auth.uid() = user_id);

-- transactions: 用户查看自己的
create policy "Users can view own transactions" on transactions
  for select using (auth.uid() = user_id);

-- voices: 所有人可读
create policy "Voices are publicly readable" on voices
  for select using (true);

-- updated_at 自动更新
create function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on projects
  for each row execute procedure update_updated_at();
```

- [ ] **步骤 2：创建 `supabase/seed.sql`（预设音色）**

```sql
insert into voices (name, gender, style, provider, provider_voice_id, is_active) values
  ('小雅', 'female', '温暖亲切', 'aliyun', 'xiaoya', true),
  ('老陈', 'male', '理性沉稳', 'aliyun', 'laochen', true),
  ('小林', 'female', '活泼明快', 'mimo', 'xiaolin', true);
```

- [ ] **步骤 3：在 Supabase Dashboard 执行 schema.sql**

登录 https://supabase.com → 项目 → SQL Editor → 粘贴 schema.sql → Run。
然后执行 seed.sql。

- [ ] **步骤 4：Commit**

```bash
git add -A
git commit -m "feat: add complete database schema with RLS policies"
```

---

### 任务 5：数据库类型定义

**文件：**
- 创建：`src/types/database.ts`

- [ ] **步骤 1：创建类型文件 `src/types/database.ts`**

```typescript
export type EpisodeStatus =
  | 'pending' | 'parsing' | 'scripting' | 'script_ready'
  | 'confirming' | 'tts_processing' | 'mixing'
  | 'post_processing' | 'completed' | 'failed'

export type StepStatus = 'pending' | 'running' | 'done' | 'failed'

export interface Profile {
  id: string
  name: string | null
  avatar_url: string | null
  balance: number
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  name: string
  description: string | null
  voice_config: Record<string, unknown>
  bgm_config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ScriptSegment {
  role: string
  text: string
  emotion: string
  pause_ms: number
}

export interface Episode {
  id: string
  project_id: string | null
  user_id: string
  title: string | null
  status: EpisodeStatus
  failed_at_step: string | null
  topic: string
  params: {
    duration_min: number
    style: string
    roles_count: number
  }
  materials: Array<{ type: string; url: string; extracted_text?: string }>
  script: ScriptSegment[] | null
  audio_url: string | null
  show_notes: string | null
  chapters: Array<{ time: string; title: string }> | null
  cover_url: string | null
  preview_url: string | null
  estimated_cost: number | null
  actual_cost: number | null
  created_at: string
  completed_at: string | null
}

export interface EpisodeStep {
  id: string
  episode_id: string
  step: string
  status: StepStatus
  attempt: number
  error_message: string | null
  started_at: string | null
  finished_at: string | null
}

export interface Voice {
  id: string
  name: string
  gender: 'male' | 'female'
  style: string
  provider: 'aliyun' | 'mimo'
  provider_voice_id: string
  sample_url: string | null
  is_active: boolean
}

export interface UsageLog {
  id: string
  user_id: string
  episode_id: string | null
  type: 'llm_token' | 'tts_char' | 'storage_mb' | 'mixing'
  quantity: number
  cost: number
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  type: 'charge' | 'refund' | 'topup'
  amount: number
  stripe_payment_id: string | null
  description: string | null
  created_at: string
}
```

- [ ] **步骤 2：Commit**

```bash
git add -A
git commit -m "feat: add TypeScript type definitions for database schema"
```

---

### 任务 6：应用布局（侧边栏 + 顶栏）

**文件：**
- 创建：`src/components/sidebar.tsx`, `src/components/app-shell.tsx`, `src/app/(app)/layout.tsx`

- [ ] **步骤 1：创建侧边栏 `src/components/sidebar.tsx`**

```typescript
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard', label: '工作台', icon: '📊' },
  { href: '/projects', label: '播客项目', icon: '🎙️' },
  { href: '/create', label: '创建节目', icon: '✨' },
  { href: '/billing', label: '账单中心', icon: '💳' },
  { href: '/settings', label: '设置', icon: '⚙️' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-muted/40">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="text-lg font-bold">
          🎧 PodCast AI
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant={pathname === item.href ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start gap-3',
                pathname === item.href && 'bg-muted font-medium'
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Button>
          </Link>
        ))}
      </nav>
      <div className="border-t p-4">
        <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground" onClick={handleLogout}>
          <span>🚪</span>
          退出登录
        </Button>
      </div>
    </aside>
  )
}
```

- [ ] **步骤 2：创建应用外壳 `src/components/app-shell.tsx`**

```typescript
import { Sidebar } from './sidebar'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-8">{children}</div>
      </main>
    </div>
  )
}
```

- [ ] **步骤 3：创建受保护布局 `src/app/(app)/layout.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/app-shell'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <AppShell>{children}</AppShell>
}
```

- [ ] **步骤 4：Commit**

```bash
git add -A
git commit -m "feat: add app shell layout with sidebar navigation"
```

---

### 任务 7：登录/注册页

**文件：**
- 创建：`src/components/auth-form.tsx`, `src/app/(auth)/login/page.tsx`

- [ ] **步骤 1：创建认证表单 `src/components/auth-form.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function AuthForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  function clearError() {
    setError(null)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">🎧 PodCast AI</CardTitle>
        <CardDescription>自动化播客生产平台</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="login" onValueChange={clearError}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">登录</TabsTrigger>
            <TabsTrigger value="register">注册</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">邮箱</Label>
                <Input id="login-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">密码</Label>
                <Input id="login-password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '登录中...' : '登录'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form onSubmit={handleRegister} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="reg-name">昵称</Label>
                <Input id="reg-name" value={name}
                  onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-email">邮箱</Label>
                <Input id="reg-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">密码</Label>
                <Input id="reg-password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? '注册中...' : '注册（赠送 $1 体验金）'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
```

- [ ] **步骤 2：创建登录页 `src/app/(auth)/login/page.tsx`**

```typescript
import { AuthForm } from '@/components/auth-form'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <AuthForm />
    </div>
  )
}
```

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "feat: add login and registration page with Supabase Auth"
```

---

### 任务 8：Dashboard + 占位页面

**文件：**
- 创建：`src/app/(app)/dashboard/page.tsx`, `src/app/(app)/projects/page.tsx`, `src/app/(app)/create/page.tsx`, `src/app/(app)/billing/page.tsx`, `src/app/(app)/settings/page.tsx`

- [ ] **步骤 1：创建 Dashboard 页 `src/app/(app)/dashboard/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, balance')
    .eq('id', user!.id)
    .single()

  const { data: recentEpisodes } = await supabase
    .from('episodes')
    .select('id, title, status, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            你好，{profile?.name || '创作者'} 👋
          </h1>
          <p className="text-muted-foreground">开始制作你的下一期播客</p>
        </div>
        <Link href="/create">
          <Button size="lg">✨ 创建新节目</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              账户余额
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${profile?.balance?.toFixed(2) || '0.00'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              最近节目
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{recentEpisodes?.length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">🟢 正常</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold">最近节目</h2>
        {recentEpisodes && recentEpisodes.length > 0 ? (
          <div className="space-y-2">
            {recentEpisodes.map((ep) => (
              <Link key={ep.id} href={`/episodes/${ep.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center justify-between py-4">
                    <span>{ep.title || '未命名节目'}</span>
                    <span className="text-sm text-muted-foreground">{ep.status}</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              还没有节目，点击「创建新节目」开始吧！
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
```

- [ ] **步骤 2：创建占位页面**

`src/app/(app)/projects/page.tsx`:
```typescript
export default function ProjectsPage() {
  return <h1 className="text-2xl font-bold">播客项目</h1>
}
```

`src/app/(app)/create/page.tsx`:
```typescript
export default function CreatePage() {
  return <h1 className="text-2xl font-bold">创建新节目</h1>
}
```

`src/app/(app)/billing/page.tsx`:
```typescript
export default function BillingPage() {
  return <h1 className="text-2xl font-bold">账单中心</h1>
}
```

`src/app/(app)/settings/page.tsx`:
```typescript
export default function SettingsPage() {
  return <h1 className="text-2xl font-bold">设置</h1>
}
```

`src/app/(app)/episodes/[id]/page.tsx`:
```typescript
export default function EpisodeDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">剧集详情</h1>
      <p className="text-muted-foreground">Episode ID: {params.id}</p>
      <p className="text-muted-foreground">（完整功能在 M4 实现）</p>
    </div>
  )
}
```

- [ ] **步骤 3：Commit**

```bash
git add -A
git commit -m "feat: add dashboard page and placeholder routes"
```

---

### 任务 9：落地页 + 根布局完善

**文件：**
- 修改：`src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **步骤 1：更新根布局 `src/app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
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
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **步骤 2：创建简单落地页 `src/app/page.tsx`**

```typescript
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-background to-muted/40">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight">
          🎧 PodCast AI
        </h1>
        <p className="text-xl text-muted-foreground max-w-lg">
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
    </div>
  )
}
```

- [ ] **步骤 3：运行开发服务器验证**

```bash
npm run dev
```
访问 http://localhost:3000 确认落地页渲染正常。

- [ ] **步骤 4：Commit**

```bash
git add -A
git commit -m "feat: add landing page and finalize root layout"
```

---

### 任务 10：API 路由骨架

**文件：**
- 创建：`src/app/api/voices/route.ts`, `src/app/api/projects/route.ts`, `src/app/api/episodes/route.ts`

- [ ] **步骤 1：创建音色 API `src/app/api/voices/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('voices')
    .select('*')
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
```

- [ ] **步骤 2：创建项目 API `src/app/api/projects/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: user.id, name: body.name, description: body.description })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **步骤 3：创建剧集 API `src/app/api/episodes/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const { data, error } = await supabase
    .from('episodes')
    .insert({
      user_id: user.id,
      project_id: body.project_id || null,
      topic: body.topic,
      params: body.params,
      materials: body.materials,
      title: body.title || null,
      estimated_cost: body.estimated_cost || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **步骤 4：Commit**

```bash
git add -A
git commit -m "feat: add API route skeletons for voices, projects, episodes"
```

---

## M1 完成标准

- [ ] `npm run dev` 启动无报错
- [ ] 落地页正常渲染
- [ ] 注册/登录流程走通（Supabase Auth）
- [ ] 登录后跳转 Dashboard，显示余额和最近节目
- [ ] 未登录访问 /dashboard 重定向到 /login
- [ ] 侧边栏导航切换正常
- [ ] API /api/voices 返回预设音色
- [ ] 所有页面 TypeScript 无类型错误（`npx tsc --noEmit`）

---

## 后续里程碑（独立计划）

- M2：创建流程（素材上传 + 参数设置 + 费用预估）
- M3：Pipeline 核心（编剧 + TTS + 混音 + 状态机）
- M4：剧集详情（播放器 + 脚本编辑 + 进度追踪）
- M5：计费（Stripe 充值 + 按量扣费 + 账单页）
- M6：打磨（落地页 + PostHog + Sentry + 部署）
