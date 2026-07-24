-- Migration: Extract tts_segments from params JSONB to dedicated column
-- Run this on existing Supabase projects after schema.sql has been updated.
-- Safe to run multiple times (IF NOT EXISTS).

-- 1. Add the column if it doesn't exist
alter table public.episodes
  add column if not exists tts_segments jsonb;

-- 2. Backfill: copy tts_segments from params into the new column for existing rows
update public.episodes
set tts_segments = params -> 'tts_segments'
where params ? 'tts_segments'
  and tts_segments is null;

-- 3. Remove tts_segments from params JSONB to reclaim space (optional, safe)
update public.episodes
set params = params - 'tts_segments'
where params ? 'tts_segments';
