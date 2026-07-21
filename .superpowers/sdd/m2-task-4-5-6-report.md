# M2 任务 4-5-6 报告：播客创建向导前端组件

**状态：✅ 完成**

## 完成内容

### 前置：安装 switch 组件
- `npx shadcn@latest add switch --yes` → 生成 `src/components/ui/switch.tsx`（Base UI 版本）

### 任务 4：素材输入（Step 1）
| 文件 | 说明 |
|---|---|
| `src/components/create/material-uploader.tsx` | 三 Tab 素材上传器：文件拖拽/选择上传（POST /api/upload）、URL 添加、直接文本输入；素材列表含上传中/失败状态与移除 |
| `src/components/create/step-materials.tsx` | Step 1 页面：话题输入 + MaterialUploader 组合 |

### 任务 5：参数设置（Step 2）
| 文件 | 说明 |
|---|---|
| `src/components/create/voice-picker.tsx` | 从 GET /api/voices 加载音色，卡片式多选（受 maxCount 限制），选中高亮 + 试听 audio |
| `src/components/create/step-params.tsx` | Step 2 页面：时长/风格/角色数/BGM 四个 Select + VoicePicker + 跳过脚本确认 Switch；角色数减少时自动裁剪已选音色 |

### 任务 6：确认生成（Step 3）+ 向导主体
| 文件 | 说明 |
|---|---|
| `src/components/create/cost-estimator.tsx` | 费用预估卡片：LLM/TTS/混音分项 + 合计 + 余额充足性 Badge |
| `src/components/create/step-confirm.tsx` | Step 3 页面：节目概要汇总 + CostEstimator |
| `src/components/create/create-wizard.tsx` | 三步向导主体：步骤指示器、步骤校验（话题必填 / 音色选满）、进入 Step 3 时调 POST /api/billing/estimate、提交 POST /api/episodes 后跳转 `/episodes/[id]` |
| `src/app/(app)/create/page.tsx` | 覆盖为渲染 CreateWizard |

## 与规范的偏差（适配 Base UI 版 shadcn）
本项目 shadcn 组件基于 **Base UI**（非 Radix），做了两处必要适配：
1. `material-uploader.tsx`：Button 无 `asChild` 属性，改用 Base UI 的 `render={<span />}` 实现等效渲染（保持 label 内点击触发文件选择）。
2. `step-params.tsx`：Select 的 `onValueChange` 回调参数类型为 `string | null`，style/bgm 两处使用 `v ?? undefined` 适配 `Partial<EpisodeParams>`。

## 验证
- `npx tsc --noEmit`：本次新增全部文件 **0 错误**。
- 遗留 1 个预存错误（非本任务引入）：`src/lib/services/parser.ts(1,8)` pdf-parse 无默认导出（来自上游 commit 99e6e81）。

## Commits
| Hash | Message |
|---|---|
| `46ebf70` | feat: add material uploader and step 1 components |
| `be728e3` | feat: add voice picker and step 2 params components（含 ui/switch.tsx 依赖） |
| `b7adfc1` | feat: add create wizard with 3-step flow (materials, params, confirm) |
