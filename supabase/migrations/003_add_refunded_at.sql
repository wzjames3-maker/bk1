-- 修复无限退款 bug：添加 refunded_at 字段实现退款幂等
-- 在 Supabase SQL Editor 执行此文件

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
