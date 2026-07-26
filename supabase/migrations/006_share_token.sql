-- 006: 为 episodes 添加分享 token 列
ALTER TABLE public.episodes ADD COLUMN IF NOT EXISTS share_token text UNIQUE;

-- 索引：通过 token 快速查找
CREATE INDEX IF NOT EXISTS idx_episodes_share_token ON public.episodes(share_token) WHERE share_token IS NOT NULL;
