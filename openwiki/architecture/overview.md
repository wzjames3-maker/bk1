---
type: Architecture Overview
title: PodForge Architecture Overview
description: Describes the PodForge Next.js application layers, authenticated API surface, Supabase persistence, serverless episode pipeline, state machine, locking boundary, and completion/failure behavior.
resource: src/lib/pipeline/orchestrator.ts
tags: [architecture, nextjs, pipeline, supabase, state-machine]
---

# Architecture overview

## Runtime layers

The UI lives under `src/app` and `src/components`. Authenticated pages are grouped under `src/app/(app)/`; login and registration are under `src/app/(auth)/`. Server API routes under `src/app/api/` authenticate user-facing requests with the Supabase server client. Internal pipeline advancement uses a separate `x-pipeline-secret` check in `src/app/api/pipeline/advance/route.ts`.

Supabase is the system of record for users, projects, episodes, step logs, usage, transactions, and voices. `src/lib/supabase/{server,client,admin,middleware}.ts` separates browser/session access from privileged server operations. Storage holds source materials and generated audio; Realtime plus `use-episode-realtime.ts` surfaces episode progress to the detail UI.

The [data and billing model](../domain/data-and-billing.md) explains the tables and financial invariants that this architecture depends on.

## Episode pipeline

`src/lib/pipeline/orchestrator.ts` registers step executors and advances one step per invocation. The route releases the lock before asynchronously triggering the next step, so a long episode is decomposed into independent serverless calls rather than one request holding a lock throughout.

```text
pending
  → parsing → scripting → script_ready
  → confirming → tts_processing → mixing → post_processing
  → completed
```

The transition rules are explicit in `src/lib/pipeline/state-machine.ts`. `script_ready` is a deliberate pause: `confirming` can return `WAITING_FOR_CONFIRMATION`, leaving the episode available for manual or AI editing. `skip_confirmation` can route directly onward. Failures become `failed`, record `failed_at_step`, and invoke a refund; retry routes may restart from the recorded step. See the [generation workflows](../workflows/episode-generation.md).

Each step is responsible for its domain work and step logging: parsing extracts material text, scripting calls the LLM, TTS uploads segment audio, mixing produces the final file, and post-processing creates chapters/show notes. At the terminal step the orchestrator sums `usage_logs.cost`, stores `actual_cost`, and calls billing settlement.

## Coordination and trust boundaries

Pipeline requests require the internal secret. In production, Upstash Redis is required and uses `pipeline:lock:<userId>` with a five-minute TTL; local development can proceed without it. User-facing creation recomputes and clamps cost inputs on the server, checks project ownership, and pre-charges through a database RPC. RLS protects user-owned rows, while the admin client is used for trusted pipeline and usage writes.

This design is intentionally practical but has watch-outs: the lock is user-scoped, release is a plain delete, status validation and update are separate operations, and next-step triggering is fire-and-forget. Treat these as change-sensitive areas rather than assuming the pipeline is transactionally orchestrated. The [operations runbook](../operations/runbook.md) records the deployment implications.

## Extension points

- Add a pipeline step by defining an executor under `src/lib/pipeline/steps/`, registering it in the advance route, and updating `src/types/pipeline.ts` plus transition rules.
- Add a provider behind a service adapter such as `tts-router.ts`; do not bypass the `voices` table/provider mapping.
- Add an API workflow with authenticated ownership checks, server-side validation, and usage/billing behavior documented alongside the relevant domain page.
