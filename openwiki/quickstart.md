---
type: Reference
title: PodForge Code Wiki Quickstart
description: Entry point for the PodForge Next.js SaaS repository wiki. Explains the product, local startup, documentation map, current implementation boundaries, and where engineers should begin changes.
tags: [podforge, quickstart, nextjs, podcast, engineering]
---

# PodForge code wiki

PodForge is a Chinese-first AI podcast generation SaaS: authenticated users create an episode from source material or a prepared script, choose style and voices, pay from an account balance, and receive synthesized audio, chapters, and show notes. The application is a Next.js 16 App Router project backed by Supabase, with DeepSeek-compatible scripting, MiMo TTS, FFmpeg processing, Stripe top-ups, and Upstash Redis coordination.

## Start here

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. For static verification use `npm run lint`, `npx tsc --noEmit`, and `npm run build`. Runtime generation also requires non-secret environment configuration for Supabase, the LLM, MiMo, and (in production) Redis; payment variables are needed for Stripe checkout. Never commit `.env.local` or paste secret values into documentation.

Database initialization is not just `schema.sql`: follow the [operations runbook](operations/runbook.md) for the base schema, seed data, storage setup, migrations, and rewrite/confirmation RPCs.

## What to read next

- The [architecture overview](architecture/overview.md) explains the Next.js/API/Supabase boundary and the stepwise episode pipeline.
- The [episode generation workflows](workflows/episode-generation.md) explain AI mode, user-script mode, confirmation, editing, AI rewrites, and retry behavior.
- [Data and billing](domain/data-and-billing.md) is the canonical description of episode states, database entities, usage accounting, and balance movements.
- [AI, audio, and payment integrations](integrations/ai-audio-payments.md) documents provider adapters and the current MiMo-only TTS path.
- The [operations runbook](operations/runbook.md) covers setup order, environment categories, production requirements, and known operational risks.
- [Testing and change guidance](testing-and-change-guide.md) lists the available unit tests, static checks, smoke path, and change-sensitive areas.
- The [source map](source-map.md) maps product concerns to implementation entry points.

## Current shape and recent direction

The main product chain is `pending → parsing → scripting → script_ready → confirming → tts_processing → mixing → post_processing → completed`. User scripts start at `script_ready`; AI rewriting is available there, while manual edits are intentionally restricted to that state. Recent commits moved TTS toward MiMo's documented request format, added eight seeded MiMo voices, made failed-episode retry charge again, and made refund handling marker-based/idempotent at the application level. These changes are reflected in the [workflow](workflows/episode-generation.md) and [integration](integrations/ai-audio-payments.md) pages.

## Documentation conventions

Treat source code and SQL as authoritative when older handoff or README text differs. The repository already contains useful but time-sensitive handoff notes in `NEXT_STEPS.md`, `PLATFORM_HANDOFF.md`, and `PROJECT_HANDOFF.md`; use them for operational context, not as a substitute for current source inspection. The repository's `/openwiki/INSTRUCTIONS.md` is control metadata and is not generated documentation.

## Backlog

- **Production consistency and concurrency:** `src/app/api/pipeline/advance/route.ts` and `src/lib/services/billing.ts`; Redis lock ownership, pipeline status races, fire-and-forget triggers, and multi-operation charge/refund writes need an explicit production decision.
- **Material/file ingestion:** `src/lib/pipeline/steps/parse.ts`; file parsing is not equivalent to URL/text extraction and needs a documented supported-input contract.
- **Automated integration/E2E coverage:** `package.json` and `src/lib/services/*.test.ts`; current evidence is unit tests plus lint/typecheck/build and manual smoke checks.
- **Privacy and deployment alignment:** `supabase/storage-setup.sql` and `.github/workflows/`; final audio is public after upload, and CI/deployment coverage should be confirmed before launch.
