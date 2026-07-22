# PodCast AI 下一步计划

更新时间：2026-07-22

## 一、当前结论

主业务链路已可用：

登录 → 工作台 / 项目 / 账单 / 设置 → 创建节目 → Pipeline（编剧 / TTS / 混音 / 后处理）→ 节目详情与音频

**本轮已交付（内容质量 + 创建体验）：**

- 4 种风格预设真正注入编剧 prompt（`style-presets` + `deepseek.generateScript`）
- `script_ready` 时 AI 整段润色 / 单句重写（每集 3 次、usage 记账、立即写库）
- 结构化 Show Notes（简介 / 要点 / 章节表 + 复制；兼容旧纯文本）
- 创建向导：默认 1 人、归属项目、音色未选满提示
- PATCH script 仅 `script_ready`；创建 API `roles_count` 默认 1

最近相关提交（自新到旧示例）：

```text
feat: create wizard defaults, project pick, voice hints
feat: structured show notes with highlights and chapters copy
feat: UI for AI polish and per-segment rewrite
feat: episode AI rewrite API with quota and script PATCH guard
feat: add script polish and segment rewrite LLM helpers
feat: style presets drive podcast script generation
```

## 二、账号与数据现状

测试账号：`wzjames3@gmail.com`（密码勿写入文档 / 勿提交）

直达示例：

```text
http://localhost:3000/dashboard
http://localhost:3000/projects
http://localhost:3000/settings
http://localhost:3000/create
```

## 三、建议下一步（按优先级）

### P0：马上做

1. **安全轮换密钥**（聊天中曾暴露过 Supabase / MiMo / SenseNova / 密码）
2. **人工验收本轮功能**（见下方清单）

### P1：体验与内容

1. Select 真机/Playwright 可点性（若仅自动化问题则记 workaround）
2. 章节标题质量持续调 prompt
3. `tts_segments` 从 params 拆出（长节目膨胀）

### P2：生产就绪

1. Upstash Redis（生产并发锁必需）
2. Stripe 充值与 webhook
3. 部署 Vercel + 环境变量
4. 配置 Git remote 并推送（当前 main 可能无 upstream）

### P3：工程化

1. 冒烟脚本入库
2. CI：lint + tsc
3. 更新过时 `PROJECT_HANDOFF.md` 段落

## 四、已知问题清单

| 问题 | 严重程度 | 状态 |
|---|---|---|
| 密钥曾出现在聊天记录 | 高 | 需人工轮换 |
| 创建向导 Select（Playwright）可能难点 | 中 | 真机优先验收 |
| 侧栏 + 设置双「退出登录」自动化冲突 | 低 | 功能可用 |
| skip_confirmation=true 无 AI 改稿入口 | 低 | 预期行为 |

## 五、本轮验收清单

```text
[ ] casual vs deep 同话题脚本差异明显
[ ] script_ready：整段润色成功，rewrite_count 递增
[ ] 单句重写成功；第 4 次 AI 改稿 429
[ ] 非 script_ready 调用 rewrite / PATCH script → 400
[ ] 手改 → 确认 → TTS → completed
[ ] Show Notes：简介 + ≥3 要点 + 章节表；复制可用
[ ] 旧节目纯文本 show_notes 仍能展示
[ ] /create 默认 1 人；选满音色可下一步；可选项目
[ ] lint + tsc 通过
```

## 六、验证命令

```bash
npm run lint
npx tsc --noEmit
npm run dev
```

规格 / 计划：

```text
docs/superpowers/specs/2026-07-22-content-quality-create-ux-design.md
docs/superpowers/plans/2026-07-22-content-quality-create-ux.md
```

## 七、给下一任助手的一句话

主链路与内容质量增量已合入；优先轮换密钥并按 §五 手测，再做 Redis/Stripe/部署。
