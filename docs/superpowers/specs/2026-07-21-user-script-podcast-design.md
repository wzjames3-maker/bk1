# 用户脚本直传播客生成 — 设计规格

日期：2026-07-21

## 概述

在现有「AI 编剧」创建流程旁新增「我的脚本」模式：用户直接提供完整脚本，系统解析后跳过 AI 编剧，直接进入 TTS → 混音 → 后处理链路。

## 核心决策

| 维度 | 决定 |
|------|------|
| 输入格式 | 纯文本 / 结构化对话 / .txt / .docx，系统自动识别 |
| AI 处理 | 默认直接用，可选「AI 润色」开关 |
| 角色-音色 | LLM 智能匹配（DeepSeek 看音色库自动分配） |
| UI 入口 | 融合到现有 /create 第一步，Tab 切换模式 |
| 架构方案 | 前端解析 + 跳过 scripting 步骤（方案 A） |

## §1 脚本解析模块

**文件：** `src/lib/services/script-parser.ts`

**输入来源：**
- 粘贴文本 → 前端直接解析
- .txt 上传 → 前端 FileReader 读取 → 前端解析
- .docx 上传 → `/api/upload` 服务端提取纯文本 → 返回文本 → 前端解析

**自动识别逻辑：**

1. 正则匹配 `角色名：台词` 或 `角色名: 台词` 行
2. 判定为结构化对话需同时满足：
   - ≥60% 的非空行匹配
   - 去重角色名 ≤ 5 个
   - 每个角色至少出现 2 次
3. 满足 → 结构化模式；否则 → 纯文本模式

**结构化模式：**
- 按行提取 role + text（支持中文冒号 `：` 和英文冒号 `:`）
- 空行忽略

**纯文本模式：**
- 优先按换行拆段
- 单段 > 200 字 → 按句末标点（。？！）二次拆分
- 角色统一为 "主播"

**通用后处理：**
- `emotion: "中性"`, `pause_ms: 300`
- 去除首尾空白、合并连续空行
- 输出类型复用 `ScriptSegment[]`

## §2 UI 变更

**改动文件：** `step-materials.tsx`, `create-wizard.tsx`, `step-params.tsx`

**第一步新增模式切换 Tab：**
- 「🤖 AI 编剧」— 现有界面不变
- 「📝 我的脚本」— 脚本输入区

**脚本模式界面：**
- 大文本区（textarea, min-h-200px）+ 文件上传按钮
- 「解析预览」按钮 → 前端即时解析 → segments 列表预览
- 每段可编辑文字、修改角色名、删除段落
- 可选开关「AI 润色脚本」
- 下一步条件：segments ≥ 1 段

**Step 2 适配：**
- `roles_count` 自动从 segments 去重角色名数量（不可手动改）
- 音色区显示 LLM 匹配结果，每个角色旁有下拉框可手动更换
- 时长/风格/BGM 保持不变

## §3 LLM 智能音色匹配

**文件：** `src/lib/services/voice-matcher.ts`

**逻辑：**
- 将角色名列表 + 音色库（id, name, gender, style）发给 DeepSeek
- Prompt 要求返回 JSON `{ "角色名": "voice_id", ... }`
- LLM 根据角色名语义、台词上下文、音色描述进行最佳匹配

**兜底：** LLM 调用失败 → 按出场顺序轮询分配

**UI：** 匹配结果为默认值，用户可手动调整

## §4 API & Pipeline 变更

### 新增 API

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/script/polish` | POST | AI 润色，输入 segments → 输出润色后 segments |

### 修改 API

**`POST /api/episodes`** 新增分支：

```
if (body.script?.length > 0) {
  // 脚本模式
  insert({
    script: body.script,
    status: 'script_ready',
    params: { ...body.params, source: 'user_script' },
  })

  if (params.skip_confirmation) {
    triggerPipeline(episodeId, userId, 'confirming')
  }
  // 否则等用户手动点「确认脚本，开始合成」
} else {
  // 现有 AI 编剧模式（不变）
  insert({ status: 'pending' })
  triggerPipeline(episodeId, userId, 'parsing')
}
```

### 费用预估

- 脚本模式：`tts_cost = 实际总字数 / 1000 * 0.015`
- LLM 费用 = 0（勾选 AI 润色时加 0.01）
- 混音费 = 0.01（固定）

### Pipeline

- Orchestrator 无需改动
- 脚本模式从 `script_ready` 状态进入已有 confirm → TTS → mix → post 链路
- `params.source: 'user_script'` 标记来源，便于后续统计

## 不在范围内

- 脚本版本历史/回滚
- 多人协作编辑脚本
- 脚本模板库
- 音频试听（仍走现有 30s preview 逻辑）
