# PodCast AI 下一步计划

更新时间：2026-07-22

## 一、当前结论

主业务链路已可用：

登录 → 工作台 / 项目 / 账单 / 设置 → 创建节目 → Pipeline（编剧 / TTS / 混音 / 后处理）→ 节目详情与音频

已验证通过的能力：

- Supabase 登录与鉴权路由守卫
- 工作台最近节目列表（`title || topic`）
- 播客项目页（默认项目、归类、新建项目）
- 设置页（账户信息、改昵称、退出登录）
- 账单页与费用预估 API
- 节目详情（进度 / 脚本 / Show Notes / 音频）
- 端到端生成：SenseNova 编剧 + MiMo TTS + FFmpeg 混音
- 章节时间按真实音频时长对齐（并按混音总时长缩放）
- 完成时写入 `actual_cost` 并结算
- 生产环境无 Redis 时拒绝启动并发锁（开发环境可跳过）

最近正式提交：

```text
770dc5b fix: align chapters with real TTS duration and harden pipeline
```

当前还有未提交改动（工作区不干净）：

```text
src/app/(app)/dashboard/page.tsx
src/app/(app)/projects/page.tsx
src/app/(app)/settings/page.tsx
src/app/api/episodes/route.ts
src/lib/pipeline/steps/post.ts
src/lib/services/audio-duration.ts
NEXT_STEPS.md（本文件）
```

## 二、账号与数据现状

测试账号：`wzjames3@gmail.com`（密码勿写入文档 / 勿提交）

已有数据示例：

- 项目：`默认项目`
- 节目：`AI AGENT未来发展的方向`（completed）
- 节目：`账号验收测试：短播客项目归属`（completed）
- 冒烟中还会创建短节目并自动归入默认项目

直达示例：

```text
http://localhost:3000/dashboard
http://localhost:3000/projects
http://localhost:3000/settings
http://localhost:3000/episodes/cca772ba-580b-4407-a46a-7ef44a9833c2
```

## 三、建议下一步（按优先级）

### P0：马上做

1. **提交当前未提交改动**
   - 内容包括：项目页、设置页、仪表盘展示修复、创建时自动归项目 / 写 title、章节缩放
   - 命令示例：

```bash
git status --short
git add src/app/\(app\)/dashboard/page.tsx \
  src/app/\(app\)/projects/page.tsx \
  src/app/\(app\)/settings/page.tsx \
  src/app/api/episodes/route.ts \
  src/lib/pipeline/steps/post.ts \
  src/lib/services/audio-duration.ts \
  NEXT_STEPS.md
git commit -m "feat: projects/settings pages, episode project auto-assign, chapter scale"
```

2. **安全轮换密钥**
   - 聊天中出现过：Supabase secret、MiMo key、SenseNova key、账号密码
   - 在各平台删除/重建后只更新本地 `.env.local`
   - **不要**把真实密钥写进 Git 或 Markdown

3. **人工再验收一轮创建向导**
   - `/create` 选「1 人独白」+「小林」
   - 勾选跳过脚本确认
   - 确认费用预估 → 生成 → 详情页章节时间 ≤ 音频总时长

### P1：产品体验优化

1. **创建向导可测性 / 交互**
   - 角色数默认改为 1，或提示「需选满角色数音色」
   - Select 打开后遮罩拦截点击的问题（Playwright 已踩坑）
   - 创建页支持选择已有项目（现在自动进默认项目）

2. **退出登录按钮重复**
   - 侧栏与设置页各有一个「退出登录」
   - 自动化会 strict mode 冲突；产品上可保留，但测试选择器要区分

3. **章节标题质量**
   - 时间已对齐真实音频
   - 标题可继续用 LLM，但禁止 LLM 写时间（已部分实现）

4. **`tts_segments` 存储**
   - 当前写在 `episodes.params`，长节目可能膨胀
   - 中期可拆独立字段或旁路元数据

### P2：生产就绪

1. **Upstash Redis**
   - 生产并发锁必需（代码已强制）
   - 配置：

```env
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
```

2. **Stripe 充值**
   - 账单页充值链路需真实密钥与 webhook

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

3. **部署 Vercel**
   - 配齐环境变量
   - 确认 `PIPELINE_INTERNAL_SECRET`、`NEXT_PUBLIC_APP_URL`
   - 生产必须有 Redis

4. **配置 Git remote 并推送**
   - 当前 `main` 无 upstream

```bash
git remote -v
# 配置 origin 后
git push -u origin main
```

### P3：工程化

1. 把冒烟脚本固化到仓库（如 `scripts/smoke-playwright.mjs`）
2. CI：`lint` + `tsc` + 冒烟（需浏览器依赖）
3. 更新 `PROJECT_HANDOFF.md` 中过时段落（部分仍写「数据库未初始化」）

## 四、已知问题清单

| 问题 | 严重程度 | 状态 |
|---|---|---|
| 创建向导 UI 选音色时 Select 遮罩挡点击 | 中 | 未修（API 创建正常） |
| 角色数默认 2，只选 1 个音色无法点下一步 | 中 | 产品行为；可优化默认值 |
| 侧栏 + 设置双「退出登录」导致自动化冲突 | 低 | 功能可用 |
| 旧节目若无 `audio_duration_ms` 无法自动重算章节 | 低 | 新生成已修复 |
| 密钥曾出现在聊天记录 | 高 | 需人工轮换 |

## 五、验证清单（下次继续时）

```bash
# 代码
npm run lint
npx tsc --noEmit

# 服务
npm run dev

# 关键路径（登录后）
# /dashboard  /projects  /create  /billing  /settings  /episodes/[id]
```

Playwright 依赖（本机已装过部分）：

```bash
# 若 Chromium 报缺库
sudo apt-get install -y libnspr4 libnss3 libasound2t64
```

冒烟截图目录：

```text
/tmp/opencode/playwright-full-smoke/
```

## 六、建议执行顺序（最短路径）

1. 提交当前未提交代码 + 本文件  
2. 轮换所有暴露过的密钥 / 密码  
3. 人工走一遍 `/create` 完整生成  
4. 配 Redis（若准备上线）  
5. 推远程 / 部署 Vercel  

## 七、给下一任助手的一句话

先读 `NEXT_STEPS.md` 与 `PROJECT_HANDOFF.md`，再 `git status`；主链路已通，优先提交未提交改动、轮换密钥、修创建向导交互，再做部署。
