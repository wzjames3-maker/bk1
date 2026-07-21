# M2 Task 1-2-3 Report: Storage 上传、素材解析、费用估算

## 状态：✅ 完成

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `bf31617` | feat: add storage buckets and file upload API |
| 2 | `99e6e81` | feat: add material parser service (PDF/Word/URL/text) |
| 3 | `9eaf0a1` | feat: add cost estimation service and API |

## 任务 1：Storage + 上传 API

- `supabase/storage-setup.sql` — 创建 `materials`（私有）和 `audio`（公开）bucket，配置 RLS 策略
- `src/lib/supabase/storage.ts` — `uploadMaterial()` 和 `getSignedUrl()` 工具函数
- `src/app/api/upload/route.ts` — POST /api/upload，支持 PDF/Word/TXT，限 10MB

## 任务 2：素材解析服务

- 安装依赖：`pdf-parse`、`cheerio`、`mammoth`、`@types/pdf-parse`
- `next.config.ts` — 添加 `serverExternalPackages: ['pdf-parse']`
- `src/lib/services/parser.ts` — 统一解析入口 `parseMaterial()`，支持 PDF/Word/URL/纯文本

## 任务 3：费用估算服务 + API

- `src/lib/services/cost.ts` — `estimateCost()` 纯函数，基于时长/角色数/素材字数估算 LLM + TTS + 混音费用
- `src/app/api/billing/estimate/route.ts` — POST /api/billing/estimate，返回费用明细 + 用户余额 + 是否充足
