---
type: Workflow
title: Episode Generation and Editing Workflows
description: Documents how PodForge creates AI-generated and user-script episodes, pauses for confirmation, performs TTS and post-processing, supports guarded rewriting, and retries failed episodes.
tags: [workflow, episodes, scripting, tts, editing]
---

# Episode generation and editing

## Creation modes

The three-step create wizard in `src/components/create/` collects topic/materials or a user script, duration/style/roles/voices/project, and a cost estimate. `POST /api/episodes` is the workflow boundary; it authenticates the user, clamps duration to 1–60 minutes and roles to 1–10, recomputes cost server-side, validates project ownership, creates a default project when needed, and pre-charges the balance.

**AI mode** inserts a `pending` episode and triggers `parsing`. Parsing extracts URL/text material, scripting calls the DeepSeek-compatible service with the selected style preset, and the episode becomes `script_ready`.

**User-script mode** normalizes supplied `{ role, text, emotion, pause_ms }` segments and inserts directly as `script_ready`, bypassing parsing and AI scripting. `/api/script/parse` can format raw text first; `/api/script/polish` is an optional pre-creation polish path.

## Confirmation and production

At `script_ready`, the episode detail page can show/edit the script. Confirmation calls `POST /api/episodes/[id]/confirm`, whose database RPC atomically claims the transition and rejects confirmation while a rewrite is active. Successful confirmation triggers TTS, then mixing, then post-processing. `skip_confirmation` is an explicit automation option that moves directly toward TTS; it also means there is no editing pause in the normal chain.

TTS assigns voices to roles by appearance, synthesizes segments serially, uploads segment files, and stores `tts_segments`. Mixing creates the final audio URL and records duration; post-processing uses real durations for chapters and stores structured show notes. Provider behavior is described in [AI/audio integrations](../integrations/ai-audio-payments.md).

## Editing and AI rewrite

Manual `PATCH /api/episodes/[id]` accepts title/script edits only while `script_ready`; edits are blocked when `rewrite_in_progress` is set. AI whole-script polish and single-segment rewrite use `POST /api/episodes/[id]/rewrite`. The rewrite SQL functions claim a lock, enforce a maximum of three AI rewrites, preserve the original role set, write the script and usage record, and release the lock atomically. Unsaved editor changes disable single-segment rewrite in the UI to avoid overwriting local work.

## Failure and retry

Any step exception is logged, the episode becomes `failed`, and the estimated pre-charge is refunded once using `refunded_at`. `POST /api/episodes/[id]/retry` requires ownership, `failed` status, and `failed_at_step`; after the recent `d04d54f` fix it re-charges a previously refunded episode before restarting, preventing free retries. The state machine permits restart at the failed stage.

## Change watch-outs

Keep status transitions, rewrite locks, and billing behavior aligned across route code, `src/types/database.ts`, `src/types/pipeline.ts`, and Supabase SQL. When changing creation parameters, update the UI estimate, server clamp/estimate logic, persisted `params`, and the manual smoke checklist. For changes to step timing or concurrency, inspect both Realtime ranking in `use-episode-realtime.ts` and the Redis lock behavior.
