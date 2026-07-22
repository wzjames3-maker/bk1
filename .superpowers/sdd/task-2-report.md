# Task 2 Report: shadcn/ui 初始化与组件安装

## 状态：DONE_WITH_CONCERNS

## 执行的命令和结果

| 命令 | 结果 |
|------|------|
| `npx shadcn@latest init --yes --defaults` | ✅ 成功，创建 components.json、button.tsx、utils.ts，更新 globals.css |
| `npx shadcn@latest add card --yes --overwrite` | ✅ 成功 |
| `npx shadcn@latest add input label tabs avatar dropdown-menu separator sheet badge dialog form select textarea sonner --yes --overwrite` | ✅ 成功（12 个文件创建，form 除外） |
| `npm install react-hook-form @hookform/resolvers zod` | ✅ 成功（form 组件依赖） |
| 手动创建 `src/components/ui/form.tsx` | ✅ 成功（registry 中 base-nova 风格无 form 组件） |
| `git add -A && git commit` | ✅ 成功 |

## 安装的组件列表

- avatar
- badge
- button
- card
- dialog
- dropdown-menu
- form（手动创建，base-nova 风格 registry 无此组件）
- input
- label
- select
- separator
- sheet
- sonner
- tabs
- textarea

**未安装：**
- toast（已废弃，由 sonner 替代，且 base-nova 风格 registry 中不存在）

## Commit Hash

`58eb420`

## 疑虑

1. **form 组件**：shadcn registry 的 `base-nova` 风格中不包含 form 组件，CLI 执行成功但不创建文件。已手动创建标准 shadcn/ui form 组件（基于 react-hook-form + @radix-ui/react-label + @radix-ui/react-slot）。
2. **toast 组件**：已被废弃（deprecated），在 base-nova 风格中不存在。使用 `sonner` 作为替代。
3. **风格**：`--defaults` 初始化选择了 `base-nova` 风格（非 New York），base color 为 `neutral`（非 Zinc）。这是 shadcn 最新版本默认选项。
4. **依赖**：额外安装了 `react-hook-form`、`@hookform/resolvers`、`zod` 作为 form 组件的运行时依赖。
