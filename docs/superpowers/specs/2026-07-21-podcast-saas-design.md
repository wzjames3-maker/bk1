# 自动化播客生产 SaaS — 设计规格

> 日期：2026-07-21
> 状态：已批准

## 1. 产品概述

一个面向个人内容创作者的 SaaS 平台，用户提供素材（文章/链接/文档）和话题，系统自动生成多人对话式播客音频。

### 核心流程

素材 + 话题 → AI 编剧 → 多角色 TTS 配音 → 混音 → 成品播客（音频 + show notes + 时间戳 + 封面建议）

### 目标用户

- MVP：个人内容创作者（自媒体博主、独立播客主）
- 后续扩展：企业营销团队、开发者 API

### MVP 边界

- 预设 2-3 个 AI 角色声音（后续开放自定义/克隆）
- 中文为主 + 英文术语混读
- 音频后期：拼接 + 转场 + BGM（后续加完整制作）
- 产出：音频 + show notes + 时间戳 + 封面建议（后续加平台分发）
- 计费：按量付费（Stripe）

## 2. 技术栈

| 层 | 技术 | 用途 |
|----|------|------|
| 前端框架 | Next.js 15 (App Router) | SSR + API Routes + Server Actions |
| UI 组件 | shadcn/ui + Tailwind CSS | 组件库 + 样式 |
| 状态管理 | Zustand | 轻量客户端状态 |
| 后端/BaaS | Supabase | Auth / DB / Storage / Realtime / Edge Functions |
| 数据库 | PostgreSQL (Supabase) | 业务数据 + 任务状态机 |
| 文件存储 | Supabase Storage | 音频文件、素材、封面 |
| LLM | DeepSeek V4 Pro (OpenCode Go) | 脚本生成、show notes |
| TTS | 阿里云语音合成 + MiMo | 多角色语音合成 |
| 音频处理 | FFmpeg (fluent-ffmpeg) | 拼接、混音、BGM |
| 缓存/限流 | Upstash Redis | API 限流、余额缓存、并发控制 |
| 支付 | Stripe | 按量计费、充值 |
| 错误监控 | Sentry | 异常追踪 |
| 数据分析 | PostHog | 用户行为埋点 |
| 部署 | Vercel (前端) + Supabase Cloud (后端) | 零运维 |

## 3. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    用户浏览器                             │
│         Next.js + shadcn/ui + Tailwind CSS              │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│              Next.js API Routes (Server Actions)         │
│         认证校验 / 请求入口 / 轻量业务逻辑               │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    Supabase                              │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌─────────────┐  │
│  │  Auth   │ │ Postgres │ │ Storage │ │  Realtime   │  │
│  └─────────┘ └──────────┘ └─────────┘ └─────────────┘  │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Edge Functions (Pipeline 编排)           │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                  外部服务                                │
│  DeepSeek V4 Pro / 阿里云 TTS / MiMo / Stripe          │
└─────────────────────────────────────────────────────────┘
```

### FFmpeg 运行位置

Edge Functions 不支持 FFmpeg 二进制。混音步骤放在 Next.js API Route（Vercel 支持 FFmpeg layer via `@ffmpeg-installer/ffmpeg`）。MVP 先用此方案，量大后拆独立 Railway Worker。

### Pipeline 推进机制

链式自调用：每步完成后触发下一步，无需 cron 轮询。加最大步数守卫防止死循环。

## 4. 核心 Pipeline

```
提交 (素材 + 话题 + 参数: 时长/风格/角色)
  → Step 1: 创建任务 + 费用预估确认 + 预扣余额
  → Step 2: 素材解析 (PDF/URL/Word → 纯文本)
  → Step 3: AI 编剧 (DeepSeek → 结构化对话脚本) + 自动预合成 30s 试听样本
  → Step 4: 用户确认脚本 (播放样本 / 可编辑 / 可跳过)
  → Step 5: TTS 逐段合成 (阿里云/MiMo + 质量校验)
  → Step 6: FFmpeg 混音 (拼接 + 转场 + BGM)
  → Step 7: 后处理 (show notes + 时间戳 + 封面建议)
  → 完成通知 (Supabase Realtime)
```

### 状态机

```
pending → parsing → scripting → script_ready → confirming
  → tts_processing → mixing → post_processing → completed

任何步骤失败 → failed (记录 failed_at_step，支持从该步重试)
```

### 关键设计点

1. **脚本结构化输出**：DeepSeek 返回 JSON `[{role, text, emotion, pause_ms}]`
2. **TTS 逐段合成**：按对话轮次逐段生成，失败可单段重试
3. **30s 试听样本**：编剧完成后自动预合成前 3 段，非现场按需生成
4. **用户确认可配置**：可设置跳过确认直接生成
5. **素材解析**：提取为纯文本，不转 Markdown
6. **并发控制**：Upstash Redis 限流，免费 1 并发，付费 3 并发
7. **超时处理**：外部调用 60s 超时 + 指数退避重试（最多 3 次）
8. **TTS 质量校验**：每段合成后校验音频时长 > 0 且文件大小合理

## 5. 数据库 Schema

```sql
-- 用户业务扩展
profiles (
  id UUID PK = auth.users.id,
  name TEXT,
  avatar_url TEXT,
  balance DECIMAL(10,4),
  created_at TIMESTAMPTZ
)

-- 播客项目
projects (
  id UUID PK,
  user_id UUID FK → profiles,
  name TEXT,
  description TEXT,
  voice_config JSONB,    -- 默认角色/音色配置
  bgm_config JSONB,      -- 默认 BGM 设置
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- 单期节目（核心任务表）
episodes (
  id UUID PK,
  project_id UUID FK → projects,
  user_id UUID FK → profiles,
  title TEXT,
  status TEXT,           -- 状态机枚举
  failed_at_step TEXT,
  topic TEXT,
  params JSONB,          -- {duration_min, style, roles_count}
  materials JSONB,       -- [{type, url, extracted_text}]
  script JSONB,          -- [{role, text, emotion, pause_ms}]
  audio_url TEXT,
  show_notes TEXT,
  chapters JSONB,
  cover_url TEXT,
  preview_url TEXT,      -- 30s 试听样本
  estimated_cost DECIMAL(10,4),
  actual_cost DECIMAL(10,4),
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)

-- 任务步骤日志
episode_steps (
  id UUID PK,
  episode_id UUID FK → episodes,
  step TEXT,
  status TEXT,           -- pending/running/done/failed
  attempt INT DEFAULT 1,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
)

-- 用量记录
usage_logs (
  id UUID PK,
  user_id UUID FK → profiles,
  episode_id UUID FK → episodes,
  type TEXT,             -- llm_token / tts_char / storage_mb
  quantity DECIMAL,
  cost DECIMAL(10,6),
  created_at TIMESTAMPTZ
)

-- 交易记录
transactions (
  id UUID PK,
  user_id UUID FK → profiles,
  type TEXT,             -- charge / refund / topup
  amount DECIMAL(10,4),
  stripe_payment_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ
)

-- 预设音色
voices (
  id UUID PK,
  name TEXT,
  gender TEXT,
  style TEXT,
  provider TEXT,         -- aliyun / mimo
  provider_voice_id TEXT,
  sample_url TEXT,
  is_active BOOLEAN
)
```

## 6. 前端页面

### 路由结构

```
/                        → 落地页
/login                   → 登录/注册
/dashboard               → 工作台首页
/projects                → 播客项目列表
/projects/[id]           → 项目详情
/create                  → 创建新一期（三步向导）
/episodes/[id]           → 剧集详情（进度 + 脚本 + 试听 + 下载）
/episodes/[id]/script    → 脚本编辑器
/billing                 → 账单中心
/settings                → 用户设置
```

### 核心交互

**创建页（三步向导）：**
- Step 1：输入素材（上传文件 / 粘贴链接 / 直接输入文本）+ 话题
- Step 2：设置参数（时长 / 风格 / 角色选择 / BGM / 是否跳过确认）
- Step 3：确认（费用预估展示 + 确认生成）

**剧集详情页：**
- 音频播放器（波形图 + 章节跳转）
- Pipeline 进度时间线（Realtime 驱动）
- 脚本展示/编辑 Tab
- Show Notes / 章节 / 设置 Tab

### 关键组件

| 组件 | 用途 |
|------|------|
| MaterialUploader | 拖拽上传 + 链接粘贴 + 文本输入 |
| VoicePicker | 角色音色选择卡片 + 试听 |
| ScriptEditor | 对话脚本编辑器 |
| AudioPlayer | 波形播放器 + 章节跳转 |
| PipelineProgress | 实时进度条 |
| CostEstimator | 费用估算展示 |
| EpisodeCard | 剧集卡片 |

## 7. API 设计

### Next.js API Routes

```
POST   /api/episodes              创建剧集
GET    /api/episodes              剧集列表
GET    /api/episodes/[id]         剧集详情
PATCH  /api/episodes/[id]         更新/确认脚本
DELETE /api/episodes/[id]         删除
POST   /api/episodes/[id]/retry   从失败步骤重试
GET    /api/episodes/[id]/preview 获取试听样本

POST   /api/projects              创建项目
GET    /api/projects              项目列表
GET    /api/projects/[id]         项目详情
PATCH  /api/projects/[id]         更新
DELETE /api/projects/[id]         删除

GET    /api/voices                预设音色列表

POST   /api/billing/estimate      费用预估
POST   /api/billing/checkout      Stripe 充值会话
POST   /api/billing/webhook       Stripe webhook
GET    /api/billing/usage         用量明细

POST   /api/upload                素材文件上传
```

### Supabase Edge Functions

```
pipeline-advance/    推进 pipeline（链式自调用）
tts-segment/         TTS 单段合成（可并行）
```

### 服务层封装

```
lib/services/
  deepseek.ts      编剧 + 结构化输出
  tts-aliyun.ts    阿里云 TTS
  tts-mimo.ts      MiMo TTS
  tts-router.ts    按角色路由到对应供应商
  ffmpeg.ts        混音
  parser.ts        素材解析 (pdf-parse / cheerio / mammoth)
  stripe.ts        计费
  cost.ts          费用估算
```

## 8. 计费模型

- 模式：预充值余额 + 按量扣费
- 注册赠送 $1 体验金
- 充值档位：$5 / $10 / $20
- 扣费时机：创建时预扣 → 完成时按实际结算 → 失败全额退还

| 项目 | 单价 |
|------|------|
| LLM 编剧 | $0.002 / 1K tokens |
| TTS 合成 | $0.015 / 1K 字符 |
| 音频存储 | $0.02 / GB / 月 |
| 混音处理 | $0.01 / 期 |

一期 10 分钟播客预估费用：$0.25 ~ $0.50

## 9. 错误处理

| 场景 | 处理 |
|------|------|
| DeepSeek 超时/报错 | 指数退避重试 3 次 → failed |
| TTS 单段失败 | 该段重试 3 次，不影响其他段 |
| FFmpeg 崩溃 | 重试 1 次 → failed |
| 余额不足 | 创建时预检拒绝 |
| Edge Function 超时 | 每步独立调用，单步 < 150s |
| Pipeline 死循环 | 最大步数守卫 |

## 10. 部署与环境

- 前端：Vercel（Next.js 15）
- 后端：Supabase Cloud（Auth / DB / Storage / Edge Functions / Realtime）
- 缓存：Upstash Redis
- 监控：Sentry + PostHog

### 环境变量

```
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
DEEPSEEK_API_KEY
ALIYUN_TTS_ACCESS_KEY / ALIYUN_TTS_SECRET_KEY
MIMO_API_KEY
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
UPSTASH_REDIS_URL
SENTRY_DSN
NEXT_PUBLIC_POSTHOG_KEY
```

## 11. MVP 里程碑

| 阶段 | 内容 | 预估工期 |
|------|------|----------|
| M1 | 项目初始化 + Auth + 基础布局 + DB Schema | 2-3 天 |
| M2 | 创建流程（素材上传 + 参数设置 + 费用预估） | 3-4 天 |
| M3 | Pipeline 核心（编剧 + TTS + 混音 + 状态机） | 5-7 天 |
| M4 | 剧集详情（播放器 + 脚本编辑 + 进度追踪） | 3-4 天 |
| M5 | 计费（Stripe 充值 + 按量扣费 + 账单页） | 2-3 天 |
| M6 | 打磨（落地页 + PostHog + Sentry + 部署） | 2-3 天 |

## 12. 后续迭代方向（不在 MVP 范围）

- 自定义音色 / 声音克隆
- 完整音频后期（降噪、音量标准化、转场音效）
- 一键分发到播客平台（小宇宙、Apple Podcasts、Spotify）
- 企业版 / API 服务
- 多语言支持
- 团队协作
