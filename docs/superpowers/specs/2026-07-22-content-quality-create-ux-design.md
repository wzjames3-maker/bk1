# 内容质量 + 创建体验 设计规格

**日期：** 2026-07-22  
**状态：** 已批准  
**方案：** A（质量优先、改动面最小）  
**优先级：** 先内容质量（Q4 一揽子），后创建体验  

## 1. 目标与范围

### 1.1 目标

在不动主 pipeline 状态机的前提下，提升：

1. **成片内容质量**（脚本风格、口语化、改稿、Show Notes / 章节）
2. **创建与确认路径可用性**（默认值、音色提示、项目选择、Select 可点性）

### 1.2 范围内

| 编号 | 能力 | 说明 |
|------|------|------|
| Q1 | 脚本风格与口语化 | 4 种风格真正驱动 prompt；禁书面语；字数/节奏更稳 |
| Q2 | 确认页 AI 改稿 | `script_ready` 时整段润色 + 单句重写；保留手改 |
| Q3 | 后期包装 | Show Notes 结构化（简介 / 要点 / 章节表）；章节标题去空泛词 |
| A | 创建体验 | 默认 1 人；音色未选满提示；可选项目；Select 可点性修复 |

### 1.3 范围外（本轮不做）

- 多版脚本对比、完成后全量重生成
- RSS / 分享页 / 模板市场
- Stripe / Redis / Vercel 部署
- 自动化 CI 冒烟入库
- 改稿强制预扣余额（仅记 usage）

### 1.4 成功标准

- 同话题下 `casual` / `deep` / `news` / `story` 文案差异可辨
- 确认页可不手改完成「润色 → 确认 → TTS」
- 完成后 Show Notes 含简介 + ≥3 要点 + 可复制章节表
- `/create`：默认 1 人 + 选满音色可下一步；可指定已有项目
- 每集 AI 改稿 ≤3 次；超限明确提示；手改不限

---

## 2. 架构与数据流

### 2.1 原则

- **不改** pipeline 状态机：`parsing → scripting → script_ready → tts → mix → post → completed`
- 只加强 script / post 服务、确认页 UI、创建向导
- **不改** Supabase 表结构；用现有 JSON / text 字段扩展语义

### 2.2 组件边界

| 单元 | 职责 | 依赖 |
|------|------|------|
| `src/lib/services/style-presets.ts`（新） | 4 风格 prompt 片段、禁词、节奏/字数系数 | 无 |
| `deepseek.generateScript` | 注入风格预设 + 口语硬规则 | style-presets |
| `deepseek.rewriteScript` / `rewriteSegment`（新） | 整段润色 / 单句重写 | style-presets、现有 OpenAI 客户端 |
| `post-process.generatePostContent` | 结构化 show_notes + 章节标题约束 | 无新表 |
| `POST /api/episodes/[id]/rewrite`（新） | 鉴权、门禁、配额、usage、写回 script | rewrite 服务 |
| `PATCH /api/episodes/[id]` | 手改 script 时状态门禁 | 现有 |
| `ScriptEditor` / `EpisodeDetail` | AI 润色 / 重写此句 / loading | rewrite API |
| `CreateWizard` / `StepParams` | 默认 1 人、项目选择、音色提示、Select 修复 | projects API |
| `ShowNotes` | JSON / 纯文本兼容展示与复制 | 无 |

### 2.3 改稿数据流

```
status === script_ready
  → 用户触发「整段润色」或「重写此句」
  → POST /api/episodes/[id]/rewrite
      { mode: 'polish' | 'segment', segmentIndex?, instruction? }
  → 校验：所有者、status、rewrite_count < 3、!rewrite_in_progress
  → LLM 生成新 segments（锁定现有 role 集合）
  → 立即 update episodes.script
  → params.rewrite_count += 1；清除 rewrite_in_progress
  → usage_logs insert (llm_token)
  → 返回 { script, rewrite_count, rewrite_limit: 3 }
  → 前端刷新；用户可手改（PATCH）→ 确认 → TTS
```

**落库时机（定稿）：** rewrite API **立即写回** `script`；手改仍走 PATCH；PATCH 不计入 `rewrite_count`。

### 2.4 数据落库

#### 不改表结构

#### `episodes.params` 扩展（JSON 内字段）

| 字段 | 类型 | 说明 |
|------|------|------|
| `rewrite_count` | number | 默认 0；AI 改稿成功次数 |
| `rewrite_in_progress` | boolean | 并发保护；请求中 true，结束清除 |
| 既有 | — | `duration_min`, `style`, `roles_count`, `voice_ids`, `bgm`, `skip_confirmation` 等保持 |

#### `episodes.show_notes`

由纯文本演进为**可解析 JSON 字符串**；UI 兼容旧纯文本。

```json
{
  "summary": "100-200字简介",
  "highlights": ["要点1", "要点2", "要点3"],
  "chapters": [{ "time": "00:00", "title": "具体标题" }]
}
```

| 字段 | 权威来源 |
|------|----------|
| 章节时间轴 | **`episodes.chapters`**（后处理按真实时长构建/缩放） |
| show_notes 内 chapters | 展示/一键复制副本；时间从 timed chapters 填入，**不由 LLM 写时间** |
| `cover_url` | 继续存封面**建议文案**（历史字段语义，非图片 URL） |

#### 创建时 `project_id`

- 请求体可带 `project_id`（API 已支持）
- 未传则归默认项目（现有逻辑）

---

## 3. 功能细则

### 3.1 脚本风格与口语化

**文件：** `src/lib/services/style-presets.ts`（新）+ `deepseek.ts` 接入

| style | 规则要点 |
|-------|----------|
| `casual` | 轻松闲聊、语气词、短句、互怼/接梗 |
| `deep` | 深度对谈、追问「为什么」、少口号、有论点 |
| `news` | 播报感、先结论后背景、少口头禅 |
| `story` | 叙事弧、场景细节、情绪起伏 |

**公共硬规则（system）：**

- 禁止示例：综上所述、首先其次再次、赋能、抓手、闭环（常量清单即可）
- 鼓励：接话、反问、举例、合理 `pause_ms`
- 字数目标：`duration_min * 250 * styleFactor`（news 略少，story/deep 略多）
- **费用估算仍按 250 字/分**，不随 styleFactor 变（已知偏差，本轮不阻塞）

### 3.2 AI 改稿 API

**`POST /api/episodes/[id]/rewrite`**

```ts
// Request
{
  mode: 'polish' | 'segment'
  segmentIndex?: number  // mode=segment 时必填
  instruction?: string   // 可选；默认见下
}

// Success 200
{
  script: ScriptSegment[]
  rewrite_count: number
  rewrite_limit: 3
}
```

**默认 instruction：**

- polish：`更口语、更紧凑，保持事实与角色不变`
- segment：`改写得更自然口语，保持原意与角色`

**LLM 约束：**

- 输出格式与 `generateScript` 一致（segments JSON）
- **角色名集合必须 ⊆ 原脚本角色**；校验失败则整次拒绝（502/400），不写库、不 +count

### 3.3 确认页 UI

- `script_ready` 工具栏：`AI 整段润色`（可选简短指令；默认见上）
- `ScriptEditor` 每段：`重写此句`
- 请求中：按钮 disabled + loading
- 成功：合并返回的 script（可进入/保持编辑态）
- 展示剩余次数：`AI 改稿 1/3` 类文案

### 3.4 Show Notes 与章节

**`generatePostContent` 输出目标：**

```json
{
  "summary": "...",
  "highlights": ["...", "...", "..."],
  "cover_suggestion": "...",
  "chapter_titles": ["具体标题", ...]
}
```

- `chapter_titles`：4–12 字；禁止空泛词（开场、总结、第一部分、结尾 等）；数量对齐 `chapters.length`
- 落库：`show_notes` = JSON.stringify({ summary, highlights, chapters: timedChapters })；封面建议写入既有 `cover_url` 字段语义

**`ShowNotes` UI：**

- 区块：简介 / 要点列表 / 章节表（时间 + 标题）
- 「复制全部」按钮
- 解析失败或非 JSON：整段当简介展示

### 3.5 创建体验

| 项 | 行为 |
|----|------|
| 默认 `roles_count` | 向导 **1**；`POST /api/episodes` 服务端默认 **1**（现为 `\|\| 2`，需改） |
| 音色 | 文案 `已选 x/n`；未满时下一步 disabled +「请选满 N 个音色」 |
| 项目 | 参数步 Select：用户项目列表；默认选中默认/首个项目；提交 `project_id` |
| `skip_confirmation` | 默认 **false**（保留改稿入口）；为 true 时无 script_ready 停留，无 AI 改稿（预期行为） |
| Select 遮罩 | 修 portal / pointer-events；回归风格/时长等 Select 与「下一步」 |

VoicePicker 为卡片多选，与「选满 N 个」模型一致，主要风险在 shadcn Select。

---

## 4. 计费、门禁、错误与并发

### 4.1 改稿计费与配额

| 规则 | 定稿 |
|------|------|
| 扣费 | **不预扣余额**；成功 rewrite 写 `usage_logs`（`type: llm_token`，实际 token × 单价） |
| 配额 | 每集最多 **3** 次（polish + segment 合计） |
| 计数 | `params.rewrite_count`；仅成功 +1 |
| 超限 | **429**：「本集 AI 改稿次数已用完（3/3），请手动编辑」 |
| 失败 | 不 +1、不改 script |
| 手改 PATCH | 不计入次数、不记 rewrite usage（无 LLM） |

### 4.2 状态门禁

| 接口 | 允许 | 否则 |
|------|------|------|
| `POST .../rewrite` | 仅 `script_ready` | 400 |
| `PATCH` 更新 `script` | 仅 `script_ready` | 400 |
| `PATCH` 更新 `title` | 所有者任意状态 | 保持现状 |
| `POST .../confirm` | 仅 `script_ready` | 保持现状 |

### 4.3 并发

- 前端：loading 禁用按钮
- 后端：`params.rewrite_in_progress === true` → **409**；开始置 true，finally 清除
- 不做分布式锁（单实例/低并发够用）

### 4.4 错误处理

| 场景 | HTTP / 行为 |
|------|-------------|
| 未登录 | 401 |
| 非所有者 | 404 |
| 状态不对 | 400 + 当前 status |
| 超配额 | 429 |
| 并发 rewrite | 409 |
| LLM 空/坏 JSON / 角色校验失败 | 4xx/502，原 script 不变 |
| show_notes 非 JSON | UI 纯文本回退 |

### 4.5 风险与缓解

| 风险 | 缓解 |
|------|------|
| 润色改崩角色 | prompt 锁定 role 集合 + 校验拒绝 |
| Select 难复现 | Playwright + 真机；修不到则记 workaround |
| 旧 show_notes | 纯文本兼容 |
| 3 次不够 | 手改无限；配额后续可调 |
| skip 确认用户无改稿 | 文档与默认 false；本轮不做完成后重生成 |

---

## 5. 实现顺序

1. `style-presets` + `generateScript` 接入 → 手测 4 风格差异  
2. rewrite 服务 + API + 门禁/配额/usage_logs → 手测 polish/segment  
3. 详情页 / ScriptEditor 按钮与 loading → 润色→确认→TTS  
4. post-process 结构化 + ShowNotes UI + 兼容 → 完成集验收  
5. 创建向导：默认 1 人、音色提示、project_id、Select → `/create` 验收  
6. PATCH script 门禁 + 服务端 `roles_count` 默认 1（可与 2 并行）  
7. `npm run lint` / `npx tsc --noEmit` / 手测清单 / 更新 `NEXT_STEPS.md`  

---

## 6. 验收清单

```text
[ ] casual vs deep 同话题脚本差异明显
[ ] script_ready：整段润色成功，rewrite_count=1，脚本已更新
[ ] 单句重写成功；第 4 次 AI 改稿 429
[ ] 非 script_ready 调用 rewrite / PATCH script → 400
[ ] 手改保存后确认 → TTS → completed
[ ] Show Notes：简介 + ≥3 要点 + 章节表；复制可用
[ ] 旧节目纯文本 show_notes 仍能展示
[ ] /create 默认 1 人；选 1 音色可下一步；可选项目且归属正确
[ ] 风格/时长 Select 可点选且不挡下一步
[ ] lint + tsc 通过
```

---

## 7. 相关文件（实现时触碰）

| 路径 | 变更类型 |
|------|----------|
| `src/lib/services/style-presets.ts` | 新建 |
| `src/lib/services/deepseek.ts` | 改：生成 + rewrite |
| `src/lib/services/post-process.ts` | 改：结构化输出 |
| `src/lib/pipeline/steps/post.ts` | 改：show_notes 组装 |
| `src/app/api/episodes/[id]/rewrite/route.ts` | 新建 |
| `src/app/api/episodes/[id]/route.ts` | 改：PATCH script 门禁 |
| `src/app/api/episodes/route.ts` | 改：roles 默认 1 |
| `src/components/episode/episode-detail.tsx` | 改：润色入口 |
| `src/components/episode/script-editor.tsx` | 改：单句重写 |
| `src/components/episode/show-notes.tsx` | 改：结构化 UI |
| `src/components/create/create-wizard.tsx` | 改：默认值、project_id |
| `src/components/create/step-params.tsx` | 改：项目、提示 |
| `NEXT_STEPS.md` | 改：本轮完成后更新状态 |

---

## 8. 决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 方案 | A 最小包 | 主链路已通；可交付、风险低 |
| 优先级 | 先质量后创建 UX | 用户选择「先 2 后 1」 |
| show_notes 形态 | JSON 字符串兼容纯文本 | 无 migration |
| 改稿计费 | 只记 usage + 每集 3 次 | 防刷且实现简单 |
| rewrite 写库 | API 立即写回 | 避免「未保存」与确认竞态 |
| skip_confirmation | 默认 false | 保证 Q2 可达 |
