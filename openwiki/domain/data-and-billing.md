---
type: Domain Model
title: Episode Data and Billing Model
description: Canonical guide to PodForge's Supabase entities, episode lifecycle fields, usage logs, cost estimates, balance operations, transactions, and idempotency markers.
resource: supabase/schema.sql
tags: [domain, supabase, database, billing, usage]
---

# Data and billing model

## Core entities

`profiles` extends `auth.users` and owns the account balance. `projects` group episodes and store voice/BGM configuration. `episodes` are the central aggregate: they reference a user/project, carry topic/materials/params/script, lifecycle status, generated URLs, `tts_segments`, show notes/chapters, and estimated/actual cost. `episode_steps` records step status, attempts, and errors. `voices` is a public catalog of active MiMo voice records.

`usage_logs` records billable categories (`llm_token`, `tts_char`, `storage_mb`, `mixing`) with quantity and cost. `transactions` is the account ledger for `charge`, `refund`, and `topup`; Stripe payment IDs have a partial unique index for webhook idempotency. RLS is enabled across all application tables and user-owned queries are tied to `auth.uid()`.

The [architecture overview](../architecture/overview.md) explains how pipeline steps write these records, while the [operations runbook](../operations/runbook.md) explains the SQL files required to create them.

## Episode lifecycle and stored artifacts

The status constraint covers `pending`, `parsing`, `scripting`, `script_ready`, `confirming`, `tts_processing`, `mixing`, `post_processing`, `completed`, and `failed`. `failed_at_step` supports retry. `refunded_at` was added by migration `003_add_refunded_at.sql` to prevent repeated failure refunds. `tts_segments` was extracted from `params` by migration `002_extract_tts_segments.sql`; runtime code still has a legacy fallback for older records.

Generated segment and final audio paths are user/episode scoped in Storage, but the `audio` bucket is public according to `storage-setup.sql`. Treat the resulting URLs as public artifacts, not private downloads.

## Cost and ledger flow

`src/lib/services/cost.ts` estimates LLM, TTS, mixing, and storage components. The creation API ignores any client-supplied estimate and computes from clamped server values and material length. Creation then calls `deduct_if_sufficient` and records a negative charge. Completion sums usage rows into `actual_cost`; `settle` refunds an overestimate or adds a charge for an underestimate. Failure calls `refund`, which checks `refunded_at`, adjusts balance, inserts a refund transaction, and marks the episode.

Stripe checkout/webhook top-ups insert the transaction first using `stripe_payment_id` as the idempotency gate, then adjust balance. This is stronger than a duplicate-prone check-only webhook flow, but charge/refund/settlement operations still span multiple database calls and should be treated as a production consistency concern.

## Safe schema changes

When adding an episode field or lifecycle state, update the SQL constraint/schema, TypeScript database types, route validation, UI assumptions, and tests/manual checks. Apply `schema.sql`, `seed.sql`, storage setup, both migrations, and `rewrite-lock-setup.sql` in the documented order for a fresh environment.
