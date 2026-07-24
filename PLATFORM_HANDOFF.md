# PodCast AI 跨平台开发交接

更新时间：2026-07-23  
仓库路径：`/home/wzjames/bk1`  
当前分支：`main`  
当前 HEAD：`9e5f668 fix: make episode rewrite atomic and preserve user edits`

## 1. 先做什么

在新平台继续开发前，按顺序执行：

```bash
git status -sb
git log --oneline -12
npm install
npm run lint
npx tsc --noEmit
npm run build
```

当前工作区在交接时是干净的。仓库没有 remote/upstream；如果换平台后要备份或协作，先配置 remote，再推送 `main`。

```bash
git remote -v
git remote add origin <repository-url>
git push -u origin main
```

不要执行 `git reset --hard`、`git checkout --` 或 `git clean`，除非明确要丢弃本地工作。

## 2. 项目概览

这是中文优先的 AI 播客生成 SaaS。

### 技术栈

- Next.js 16、React 19、TypeScript、Tailwind、shadcn/ui
- Supabase：Auth、Postgres、Storage、Realtime
- SenseNova / DeepSeek 兼容 API：编剧与后处理
- MiMo TTS、FFmpeg：语音合成与混音
- Stripe：充值（基础链路已在代码中）
- Upstash Redis：生产环境 pipeline 并发锁

### 主业务链路

```text
登录
  → 工作台 / 项目 / 账单 / 设置
  → 创建节目（素材、参数、项目、音色、费用预估）
  → parsing
  → scripting
  → script_ready（可手改或 AI 改稿）
  → tts_processing
  → mixing
  → post_processing
  → completed（详情、音频、章节、Show Notes）
```

状态机在 `src/lib/pipeline/state-machine.ts`；调度器在 `src/lib/pipeline/orchestrator.ts`。

## 3. 当前已完成

### 基础产品与 Pipeline

- Supabase 登录、鉴权路由保护、工作台、项目页、账单页、设置页、节目详情页。
- 端到端生成已跑通：SenseNova 编剧、MiMo TTS、FFmpeg 混音、后处理。
- 音频章节基于真实 TTS / 混音时长生成，并缩放到音频边界内。
- 完成时从 `usage_logs` 汇总 `actual_cost` 并结算。
- Next.js 16 已从 `middleware.ts` 迁移到 `src/proxy.ts`。

### 内容质量与创建体验增量

- 4 种脚本风格：`casual`、`deep`、`news`、`story`。
- 风格 prompt、禁书面语规则和目标字数在 `src/lib/services/style-presets.ts`。
- `script_ready` 支持：
  - AI 整段润色。
  - AI 单句重写。
  - 手动编辑脚本。
  - 每集最多 3 次 AI 改稿，手改不限。
- 改稿时锁定原角色集合，禁止 LLM 新增角色。
- 结构化 Show Notes：简介、要点、章节表、一键复制；兼容旧纯文本节目。
- 创建向导默认 1 人；显示已选音色数量与未选满提示；可选择已有项目。
- 创建 API 使用服务端默认 `roles_count=1`，并验证 `project_id` 归属当前用户。

### 本轮审查修复

提交 `9e5f668` 修复了以下问题：

- 改稿、确认合成使用数据库原子状态变更，避免并发改稿和确认竞争。
- 改稿用量在数据库函数内记录，避免用户态 RLS 阻止写入 `usage_logs`。
- 编辑器有未保存修改时，禁止 AI 单句重写，避免覆盖本地文本。
- 旧 Show Notes 仍会显示封面建议。

## 4. 必须执行的数据库步骤

**在使用 AI 改稿或确认合成前，必须在 Supabase SQL Editor 执行：**

```text
supabase/rewrite-lock-setup.sql
```

它创建并授权以下 RPC：

- `claim_episode_rewrite`
- `complete_episode_rewrite`
- `release_episode_rewrite_lock`
- `confirm_episode_for_tts`

这些 RPC 负责改稿锁、改稿落库、用量记录和确认 TTS 的原子状态切换。若未执行，以下接口会报「数据库函数不存在」：

```text
POST /api/episodes/:id/rewrite
POST /api/episodes/:id/confirm
```

当前环境不能自动执行该 SQL：本地 Supabase CLI 无执行权限，且没有数据库直连凭据。执行后建议立即手测改稿与确认链路。

基础数据库文件：

```text
supabase/schema.sql
supabase/seed.sql
supabase/storage-setup.sql
supabase/rewrite-lock-setup.sql
```

## 5. 本地环境

复制或创建 `.env.local`，但绝不要提交真实值。至少需要：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=
DEEPSEEK_MODEL=

MIMO_API_KEY=
PIPELINE_INTERNAL_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000

UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

说明：

- 开发环境没有 Redis 时，pipeline 可运行；生产环境缺 Redis 会拒绝启动并发锁。
- 真实 Supabase / LLM / MiMo 密钥和测试账号密码曾出现在聊天记录，必须轮换。
- `.env.local` 已被 `.gitignore` 忽略，不能加入 Git。

## 6. 验证命令

```bash
# 回归测试
npx --yes tsx --test \
  src/lib/services/episode-rewrite-guard.test.ts \
  src/lib/services/show-notes.test.ts

# 静态检查
npm run lint
npx tsc --noEmit

# 生产构建
npm run build

# 本地服务
npm run dev
```

交接前最近一次结果：

- 3 个回归测试通过。
- `npm run lint` 通过。
- `npx tsc --noEmit` 通过。
- `npm run build` 通过。

未完成完整人工 E2E 验收，因此不要把本轮全部功能视作已人工验收。

## 7. 人工验收清单

在 SQL RPC 执行完成、`npm run dev` 启动后，按此顺序检查：

1. 登录后打开 `/create`。
2. 输入话题，进入参数步骤。
3. 确认默认是「1 人独白」，选 1 个音色后可下一步。
4. 改变风格为 `casual` 和 `deep` 分别创建短节目，比较脚本表达差异。
5. 选择一个已有项目，创建后确认节目归属正确。
6. 在 `script_ready` 节目中点击「AI 整段润色」，确认次数递增且脚本立即刷新。
7. 编辑一段文本但不保存，确认「重写此句」不可用；保存后再单句重写。
8. 连续进行 3 次 AI 改稿；第 4 次应返回 429。
9. 改稿处理中点击「确认脚本」应不能启动 TTS；改稿完成后确认可继续。
10. 确认脚本，完成 TTS、混音、后处理。
11. 在完成页确认 Show Notes 包含简介、至少 3 个要点、章节表和复制按钮。
12. 打开一个旧节目的纯文本 Show Notes，确认简介与封面建议都可见。

## 8. 后续计划

### P0：上线前阻塞项

1. 在 Supabase 执行 `rewrite-lock-setup.sql`。
2. 轮换所有曾暴露的密钥与测试账号密码。
3. 完成上方人工验收清单。
4. 配置 Git remote 并将 `main` 推送到远程。

### P1：产品体验

1. 检查创建页 Select 在真机和 Playwright 下的可点性。
2. 打磨章节标题与 Show Notes prompt，提升语义质量。
3. 为 AI 润色添加用户自定义指令输入（当前使用固定默认指令）。
4. `tts_segments` 当前存于 `episodes.params`；长节目时可拆独立字段或元数据表。
5. 设置页和侧栏都有「退出登录」，自动化 selector 需要区分。

### P2：生产就绪

1. 配置 Upstash Redis，验证生产并发锁。
2. 配置真实 Stripe 密钥与 webhook，验收充值闭环。
3. 部署 Vercel，设置全部环境变量。
4. 生产环境确认 `PIPELINE_INTERNAL_SECRET` 与 `NEXT_PUBLIC_APP_URL` 正确。

### P3：工程化

1. 将 Playwright 冒烟流程固化到仓库，例如 `scripts/smoke-playwright.mjs`。
2. 在 `package.json` 增加稳定的 `test` 脚本。
3. 配置 CI：回归测试、lint、TypeScript、build。
4. 更新 `PROJECT_HANDOFF.md`：该文件的早期状态、旧提交号和部分环境描述已过时。

## 9. 关键文件索引

| 目的 | 文件 |
|---|---|
| 当前短期任务 | `NEXT_STEPS.md` |
| 本次跨平台交接 | `PLATFORM_HANDOFF.md` |
| 旧交接记录（部分过时） | `PROJECT_HANDOFF.md` |
| 内容质量设计 | `docs/superpowers/specs/2026-07-22-content-quality-create-ux-design.md` |
| 内容质量实现计划 | `docs/superpowers/plans/2026-07-22-content-quality-create-ux.md` |
| 改稿原子 RPC | `supabase/rewrite-lock-setup.sql` |
| 改稿 API | `src/app/api/episodes/[id]/rewrite/route.ts` |
| 确认 API | `src/app/api/episodes/[id]/confirm/route.ts` |
| 节目创建 API | `src/app/api/episodes/route.ts` |
| 编剧与改稿 LLM | `src/lib/services/deepseek.ts` |
| 风格预设 | `src/lib/services/style-presets.ts` |
| 后处理与章节 | `src/lib/pipeline/steps/post.ts`、`src/lib/services/post-process.ts` |
| Show Notes 解析 | `src/lib/services/show-notes.ts` |
| 改稿回归测试 | `src/lib/services/episode-rewrite-guard.test.ts` |

## 10. 最近关键提交

```text
9e5f668 fix: make episode rewrite atomic and preserve user edits
ff6eda6 docs: update NEXT_STEPS after content quality UX delivery
9578569 feat: create wizard defaults, project pick, voice hints
7b6459f feat: structured show notes with highlights and chapters copy
a16c212 feat: UI for AI polish and per-segment rewrite
8127f0c feat: episode AI rewrite API with quota and script PATCH guard
13afe5a feat: add script polish and segment rewrite LLM helpers
b601014 feat: style presets drive podcast script generation
ac0f73a feat: projects/settings UI, auto project assign, chapter scale
770dc5b fix: align chapters with real TTS duration and harden pipeline
```

## 11. 给下一位开发者的最短提示

先读本文件与 `NEXT_STEPS.md`，然后执行 `rewrite-lock-setup.sql`、轮换密钥、跑验证命令和人工 E2E。主链路已经可用；当前最重要的是把数据库 RPC 落地并完成真实环境验收，再做 Redis、Stripe、部署和 CI。
