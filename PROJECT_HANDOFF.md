# PodCast AI 项目交接状态

更新时间：2026-07-22

这份文档用于上下文压缩后快速恢复工作。当前项目是一个中文优先的播客生成 SaaS，技术栈为 Next.js 16、React 19、TypeScript、Supabase、DeepSeek、TTS、FFmpeg、Stripe 和 Upstash Redis。

## 一、当前状态

### 代码状态

- 当前分支：`main`。
- 最近提交：`a9aa20b fix: store clamped params in DB + topup insert-before-adjust for idempotency`。
- 工作区原本就有大量未提交修改，共约 111 个文件，涉及页面、API、pipeline、计费、Supabase SQL、文档和 Sentry 配置。
- 不要执行 `git reset --hard`、`git checkout --`、`git clean`，也不要覆盖这些已有修改。
- 本轮额外修改主要包括：
  - 修复创建向导中的 React lint 错误。
  - 修复素材上传组件在 render 阶段写入 ref 的问题。
  - 清理全部 lint warning。
  - 将 Next.js 16 已弃用的 `src/middleware.ts` 迁移为 `src/proxy.ts`，导出函数改为 `proxy`。

### 质量验证

以下命令最近均已通过：

```bash
npm run lint
npx tsc --noEmit
npm run build
```

当前 `npm run lint` 无 error、无 warning。

本次恢复上下文后再次验证：

```text
npm run lint       通过
npx tsc --noEmit   通过
npm run build      通过
```

使用当前 `.env.local` 启动 `npm run dev` 后，`/`、`/login` 和 `/dashboard` 均返回 HTTP 500，错误均为 `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.`。开发服务器已停止。

`npm run build` 已成功生成全部页面和 API 路由。构建日志显示 Next.js 16 使用 `Proxy`，不再有 middleware 弃用警告。

项目没有测试脚本，也没有自动化测试文件。当前验证依赖 lint、TypeScript、production build 和手动 smoke check。

## 二、代码改动摘要

### 创建向导

文件：`src/components/create/create-wizard.tsx`

- 移除了 effect 内同步调用 `setEstimateLoading(true)`，避免 React `set-state-in-effect` lint 错误。
- 在进入费用预估步骤和修改参数时设置 loading 状态。
- 费用请求仍然通过 `/api/billing/estimate` 完成。

文件：`src/components/create/material-uploader.tsx`

- 将 `materialsRef.current = materials` 从 render 阶段移到 `useEffect`，避免 React refs lint 错误。

### lint 清理

- 删除无用的 webhook 异常变量和 episodes API 导入。
- 删除无用的 `sufficient`、`chapters` prop、pipeline 未使用参数、未使用类型导入和 FFmpeg 未使用常量。
- 未改变计费、pipeline、TTS 和 FFmpeg 的实际业务流程。

### Next.js 16 Proxy 迁移

文件：`src/proxy.ts`

- 来源文件：`src/middleware.ts`。
- 使用 Next.js 16 官方迁移约定：文件名改为 `proxy.ts`，函数名改为 `proxy`。
- `src/lib/supabase/middleware.ts` 仍然保留，因为它是项目内部的 Supabase session helper，不是 Next.js 根入口文件。

## 三、Docker 状态

Docker 已安装并正常运行：

```text
Docker Engine: 29.6.1
Docker Compose: v5.3.1
系统：Ubuntu 26.04 on WSL2
```

验证命令：

```bash
docker info
```

Docker daemon 当前可用，用户已经属于 `docker` 用户组。

## 四、Docker MCP 状态

已安装官方 Docker MCP Gateway CLI，版本为 `v0.43.3-dev`，来源为 Docker 官方仓库 `docker/mcp-gateway` 的 `v0.43.3`。

安装位置：

```text
/home/wzjames/.docker/cli-plugins/docker-mcp
```

已安装 Docker MCP 官方 catalog：

```text
mcp/docker-mcp-catalog:latest
```

Catalog 当前包含约 315 个 MCP server。

因为当前环境是 WSL2 + Docker Engine，而不是 Docker Desktop，已在 `~/.zshrc` 添加：

```bash
export DOCKER_MCP_IN_CONTAINER=1
```

Docker MCP profiles 功能已启用：

```bash
DOCKER_MCP_IN_CONTAINER=1 docker mcp feature enable profiles
```

当前还没有创建具体 profile，也没有启用具体的第三方 MCP server。Gateway 当前只暴露内置动态工具，这是预期状态。

Docker MCP 验证结果：

```bash
docker mcp version
# v0.43.3-dev

docker mcp tools count
# 8 tools

docker mcp gateway run --dry-run
# Initialized successfully
```

## 五、OpenCode MCP 配置

OpenCode 全局配置文件：

```text
/home/wzjames/.config/opencode/opencode.jsonc
```

Docker MCP 当前配置：

```json
"docker": {
  "type": "local",
  "command": ["docker", "mcp", "gateway", "run"],
  "enabled": true,
  "env": {
    "DOCKER_MCP_IN_CONTAINER": "1"
  }
}
```

`opencode mcp list` 最近验证结果：

```text
context7   connected
playwright connected
docker     connected
github     failed
sentry     needs authentication
```

其中 GitHub 和 Sentry 是原有配置的独立问题，与 Docker MCP 安装无关。

OpenCode 配置不会热加载。修改配置后需要退出并重新启动 OpenCode。

## 六、当前环境阻塞点

此前项目的 `.env.local` 是模板占位值；本次已在本地填入 Supabase 项目配置：

```env
NEXT_PUBLIC_SUPABASE_URL=https://jsvlhnrlgmbcozqncbyo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=已配置 Supabase publishable key
SUPABASE_SERVICE_ROLE_KEY=已配置 Supabase secret key
```

配置 URL 后，应用基础页面已恢复：`/` 和 `/login` 返回 200，未登录访问 `/dashboard` 返回 307 并跳转登录页。`/api/voices` 已返回 200，可读取 3 条预置音色。

```text
/       200
/login  200
/dashboard 307
/api/voices 200（3 条音色）
```

schema/seed/storage 均已执行完成。下一步：本地注册/登录 smoke check。

本次检查确认：DeepSeek、阿里云 TTS、MiMo 和 Upstash 相关变量仍是占位值。Supabase CLI 当前不在 PATH 中，因此在本机不能直接执行 Supabase 项目初始化；应在 Supabase 控制台 SQL Editor 执行 SQL 文件。

安全事项：本次 Supabase secret key 曾被发送到聊天中，必须在 Supabase `Settings → API Keys` 页面删除并重新生成，然后只替换本地 `.env.local` 中的 `SUPABASE_SERVICE_ROLE_KEY`，不要再次发送。

不要把真实密钥写入 Git，也不要在聊天记录中粘贴密钥。

## 七、后续执行顺序

### 1. 配置 Supabase

在 Supabase 控制台创建或选择项目，然后将真实值写入本地 `.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 anon key
SUPABASE_SERVICE_ROLE_KEY=你的 service role key
NEXT_PUBLIC_APP_URL=http://localhost:3000
PIPELINE_INTERNAL_SECRET=本地随机字符串
```

完整 pipeline 验证还需要配置：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
ALIYUN_TTS_ACCESS_KEY=
ALIYUN_TTS_SECRET_KEY=
ALIYUN_TTS_APP_KEY=
MIMO_API_KEY=
MIMO_BASE_URL=https://api.mimo.audio
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
```

### 2. 初始化数据库和 Storage

在 Supabase SQL Editor 按顺序执行：

```text
supabase/schema.sql
supabase/seed.sql
supabase/storage-setup.sql
```

重点确认：

- `profiles`、`projects`、`episodes`、`episode_steps`、`usage_logs`、`transactions`、`voices` 表已创建。
- RPC：`adjust_balance`、`deduct_if_sufficient` 已创建。
- Storage bucket：`materials`、`audio` 已创建。
- RLS policy 已启用。
- `voices` 表中有 3 条 seed 数据。

### 3. 真实应用 smoke check

配置 Supabase 后重新启动：

```bash
npm run dev
```

验证顺序：

1. `/` 返回 200。
2. `/login` 能正常显示。
3. 未登录访问 `/dashboard`、`/create` 时跳转到 `/login`。
4. 注册或登录成功后进入 `/dashboard`。
5. `/api/voices` 能读取 3 条预置音色。
6. `/create` 可以输入主题、添加文本素材、选择参数和音色。
7. 费用预估显示余额和估算金额。
8. 创建节目后 episode 状态进入 pipeline。
9. 检查 `episode_steps`、余额扣款和失败退款逻辑。

### 4. Docker MCP profile

只有在明确需要某个 MCP server 时才添加，不要一次性启用整个 catalog。

查看可用服务器：

```bash
source ~/.zshrc
docker mcp catalog server ls mcp/docker-mcp-catalog:latest
```

创建 profile 的示例：

```bash
docker mcp profile create --name podcast-dev \
  --server catalog://mcp/docker-mcp-catalog/playwright
```

查看 profile：

```bash
docker mcp profile list
docker mcp profile show podcast-dev
```

若 OpenCode 使用特定 profile，可将 MCP 命令改为：

```json
"command": ["docker", "mcp", "gateway", "run", "--profile", "podcast-dev"]
```

修改后重启 OpenCode。

## 八、重要安全注意事项

- 不要提交 `.env.local`。
- 不要在 MCP 配置中直接写 API key，优先使用环境变量或 Docker secret。
- 不要随意启用有写入、支付、GitHub 管理或生产数据库权限的 MCP server。
- Docker MCP Gateway 的工具权限会影响当前本机 Docker daemon，使用前确认 server 和 tool allowlist。
- 不要清理当前工作区已有的 111 个未提交文件。
- 不要运行 `git reset --hard`、`git checkout --` 或 `git clean`。

## 九、常用恢复命令

```bash
# 查看项目状态
git status --short

# 基础验证
npm run lint
npx tsc --noEmit
npm run build

# Docker 验证
source ~/.zshrc
docker info
docker mcp version
docker mcp tools count
docker mcp gateway run --dry-run

# OpenCode MCP 验证
opencode mcp list
```

## 十、下一次继续时的建议提示

恢复上下文后，先阅读本文件，然后执行：

```bash
git status --short
source ~/.zshrc
docker info
docker mcp version
```

Supabase、schema/seed/storage 均已完成，`/api/voices` 已通过。用户已成功登录 `/dashboard`。下一步：在 `/create` 走创建向导 smoke check。

本次恢复上下文后的结论：静态检查和 production build 均通过；Supabase 基础连接已恢复，但数据库尚未初始化。真实业务流程仍需先完成三个 SQL 文件的执行。
