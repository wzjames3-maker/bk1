---
type: Engineering Guide
title: Testing and Change Guide
description: Verification guidance for PodForge contributors, covering the available service tests, lint/typecheck/build checks, manual episode smoke flow, and areas where changes can violate cross-layer contracts.
tags: [testing, verification, maintenance, engineering]
---

# Testing and change guide

## What exists

The repository has focused service tests for rewrite guards, script parsing, script validation, and show-notes compatibility:

- `src/lib/services/episode-rewrite-guard.test.ts`
- `src/lib/services/script-parser.test.ts`
- `src/lib/services/script-validate.test.ts`
- `src/lib/services/show-notes.test.ts`

`package.json` has no `test` script. When dependencies provide `tsx`, run:

```bash
npx --yes tsx --test \
  src/lib/services/episode-rewrite-guard.test.ts \
  src/lib/services/script-parser.test.ts \
  src/lib/services/script-validate.test.ts \
  src/lib/services/show-notes.test.ts
```

Always run `npm run lint`, `npx tsc --noEmit`, and `npm run build`. These checks are the current repeatable baseline; no repository evidence establishes comprehensive API, provider, database, Redis, or browser E2E coverage.

## Manual smoke path

After database setup and environment configuration: authenticate, open `/create`, create both a short user-script episode and an AI episode, verify project ownership and server cost behavior, compare `casual` vs `deep`, test whole-script polish and single-segment rewrite, confirm the fourth rewrite is rejected, test unsaved-edit protection, confirm the script, and observe TTS → mixing → post-processing → completed. Verify structured show notes and legacy plain-text notes, then test failure refund, retry re-charge, and duplicate Stripe webhook handling.

## Cross-layer change checklist

- **Pipeline/state:** update `src/types/pipeline.ts`, state transitions, executor registration, step logs, route chaining, and failure/refund behavior together. See the [architecture](architecture/overview.md).
- **Creation parameters:** update wizard state, estimate API, server clamps, persisted `params`, script mode, and manual checks. The server must remain authoritative.
- **Script/rewrite:** preserve role validation, rewrite count, atomic SQL RPCs, editor dirty-state guard, and `script_ready` restrictions. See the [workflow](workflows/episode-generation.md).
- **Schema/billing:** update SQL, migrations/types, RLS, usage rows, ledger semantics, and setup order. See [data and billing](domain/data-and-billing.md).
- **Providers/audio:** inspect router, provider retries/timeouts, storage policy, duration probing, and serial execution limits. See [integrations](integrations/ai-audio-payments.md).

Use recent history as rationale: `4c43562` changed MiMo request/prompt construction, `d04d54f` fixed free retries by recharging, `4a9c980` added refund idempotency, `aadf099` expanded voices, and `2936d8b` removed Aliyun. These commits show that provider contracts and billing invariants are active maintenance surfaces.
