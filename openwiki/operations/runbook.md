---
type: Runbook
title: PodForge Operations Runbook
description: Practical setup and diagnosis notes for local development and production of PodForge, including Supabase SQL order, environment categories, pipeline prerequisites, security boundaries, and launch blockers.
tags: [operations, runbook, deployment, supabase, security]
---

# Operations runbook

## Initialize Supabase

For a fresh project, execute these files in Supabase SQL Editor:

```text
supabase/schema.sql
supabase/seed.sql
supabase/storage-setup.sql
supabase/migrations/002_extract_tts_segments.sql
supabase/migrations/003_add_refunded_at.sql
supabase/rewrite-lock-setup.sql
```

Confirm the tables, RLS policies, `adjust_balance`/`deduct_if_sufficient`, rewrite/confirmation RPCs, `materials` and `audio` buckets, eight seeded voices, `episodes.tts_segments`, and `episodes.refunded_at`. The rewrite and confirm APIs specifically depend on the last SQL file.

## Configure and start locally

Use `.env.local` (ignored by Git) with placeholders replaced locally. Baseline values are Supabase URL/keys, `NEXT_PUBLIC_APP_URL`, and `PIPELINE_INTERNAL_SECRET`. Full generation adds `DEEPSEEK_API_KEY`/model settings, `MIMO_API_KEY`/base URL/model/format, and local development may omit Redis. Stripe checkout adds its secret, webhook secret, publishable key, and app URL.

```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

The code reads `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN`; verify names against source rather than older README references to `*_REST_*`. Production refuses pipeline advancement without non-placeholder Redis credentials.

## Smoke diagnosis

Check `/`, `/login`, unauthenticated redirect behavior for `/dashboard` and `/create`, authenticated `/api/voices`, then create a short user-script episode. Exercise polish/rewrite, the three-rewrite limit, confirmation, TTS, final audio, show notes, failure/refund, retry/re-charge, and replayed Stripe webhook. The detailed sequence is in [testing guidance](../testing-and-change-guide.md).

If rewrite or confirmation reports a missing database function, apply `rewrite-lock-setup.sql`. If a pipeline stalls, inspect `episodes.status`, `failed_at_step`, `episode_steps`, server logs, `PIPELINE_INTERNAL_SECRET`, `NEXT_PUBLIC_APP_URL`, and Redis availability. If audio is unexpectedly inaccessible, check the storage bucket/policy and generated path.

## Security and launch blockers

Do not read, commit, or document secret values. Rotate credentials if they were exposed outside trusted secret storage. Keep server cost computation, RLS ownership filters, internal pipeline authentication, and service-role usage intact. Remember that generated audio is public under the current storage setup.

Before production, explicitly decide whether to harden user-scoped lock ownership, fire-and-forget step delivery, status races, and multi-call billing consistency. Also confirm migrations/RPCs are applied, Stripe webhook configuration is live, Vercel execution limits fit serial TTS, and CI/E2E coverage is adequate.

See [data and billing](../domain/data-and-billing.md) for persistence invariants and [integrations](../integrations/ai-audio-payments.md) for provider-specific configuration.
