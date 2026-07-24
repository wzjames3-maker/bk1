-- 004: 移除阿里云 TTS provider，统一为 MiMo
-- 执行前提：003_add_refunded_at.sql 已执行

-- 1. 删除阿里云音色数据
DELETE FROM public.voices WHERE provider = 'aliyun';

-- 2. 收窄 provider CHECK 约束为仅 mimo
ALTER TABLE public.voices DROP CONSTRAINT IF EXISTS voices_provider_check;
ALTER TABLE public.voices ADD CONSTRAINT voices_provider_check CHECK (provider IN ('mimo'));
