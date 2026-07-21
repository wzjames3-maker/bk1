# 任务 6-7-8 实施报告

**状态：✅ 全部完成**
**日期：2026-07-21**

## 任务 6：应用布局（App Shell）

| 文件 | 说明 |
|------|------|
| `src/components/sidebar.tsx` | 客户端侧边栏：5 个导航项（工作台/播客项目/创建节目/账单中心/设置），当前路由高亮，底部退出登录按钮（调用 `supabase.auth.signOut()` 后跳转 `/login`） |
| `src/components/app-shell.tsx` | 布局壳：左侧固定 Sidebar + 右侧可滚动主内容区（max-w-6xl） |
| `src/app/(app)/layout.tsx` | 受保护路由组布局：服务端 `getUser()` 校验，未登录 `redirect('/login')`，已登录渲染 AppShell |

## 任务 7：登录/注册页

| 文件 | 说明 |
|------|------|
| `src/components/auth-form.tsx` | 客户端认证表单：Tabs 切换登录/注册；登录用 `signInWithPassword`，注册用 `signUp`（`options.data.name` 传递昵称）；含 loading 状态与错误提示；成功后跳转 `/dashboard` 并 `router.refresh()` |
| `src/app/(auth)/login/page.tsx` | 登录页：居中渲染 AuthForm |

## 任务 8：Dashboard 与占位页面

| 文件 | 说明 |
|------|------|
| `src/app/(app)/dashboard/page.tsx` | 服务端页面：读取 profiles（name/balance）与最近 5 条 episodes；欢迎横幅 + 创建新节目 CTA + 3 张统计卡片（余额/节目数/状态）+ 最近节目列表（空态提示） |
| `src/app/(app)/projects/page.tsx` | 占位：播客项目 |
| `src/app/(app)/create/page.tsx` | 占位：创建新节目 |
| `src/app/(app)/billing/page.tsx` | 占位：账单中心 |
| `src/app/(app)/settings/page.tsx` | 占位：设置 |
| `src/app/(app)/episodes/[id]/page.tsx` | 剧集详情占位：显示 Episode ID，完整功能留待 M4 |

**实现偏差说明**：项目实际为 Next.js 16（`next@16.2.10`），动态路由 `params` 为 Promise 类型，故 `episodes/[id]/page.tsx` 采用 `params: Promise<{ id: string }>` + `await params` 的异步写法（规格中的同步写法会导致类型错误），其余逻辑与规格一致。

## Git 提交记录

| Commit | Message |
|--------|---------|
| `f0405e4` | feat: add app shell layout with sidebar navigation |
| `b82fd42` | feat: add login and registration page with Supabase Auth |
| `a03b61c` | feat: add dashboard page and placeholder routes |

共 11 个新文件，327 行新增代码，工作区无遗留未提交的源码改动。
