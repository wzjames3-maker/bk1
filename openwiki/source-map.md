---
type: Source Map
title: PodForge Source Map
description: Practical source navigation for PodForge engineers and future agents, organized by product concern rather than by raw directory listing.
tags: [source-map, navigation, repository]
---

# Source map

Use this map to begin source exploration; then follow the canonical concept pages for behavior and change guidance.

| Concern | Start here | Related concept |
|---|---|---|
| Application shell and auth | `src/app/layout.tsx`, `src/proxy.ts`, `src/lib/supabase/` | [Architecture](architecture/overview.md) |
| Creation wizard | `src/components/create/create-wizard.tsx`, `step-materials.tsx`, `step-params.tsx` | [Generation workflow](workflows/episode-generation.md) |
| Episode detail/editing | `src/components/episode/episode-detail.tsx`, `script-editor.tsx`, `pipeline-progress.tsx` | [Generation workflow](workflows/episode-generation.md) |
| Episode API | `src/app/api/episodes/route.ts`, `src/app/api/episodes/[id]/` | [Generation workflow](workflows/episode-generation.md) |
| Pipeline dispatch | `src/app/api/pipeline/advance/route.ts`, `src/lib/pipeline/orchestrator.ts`, `state-machine.ts` | [Architecture](architecture/overview.md) |
| Pipeline work | `src/lib/pipeline/steps/{parse,script,confirm,tts,mix,post}.ts` | [Integrations](integrations/ai-audio-payments.md) |
| LLM and content rules | `src/lib/services/deepseek.ts`, `style-presets.ts`, `script-parser.ts`, `script-validate.ts`, `show-notes.ts` | [Workflow](workflows/episode-generation.md) |
| Billing and costs | `src/lib/services/{billing,cost,usage-logger}.ts`, `src/app/api/billing/` | [Data and billing](domain/data-and-billing.md) |
| Provider adapters | `src/lib/services/{tts-router,tts-mimo,ffmpeg,stripe}.ts` | [Integrations](integrations/ai-audio-payments.md) |
| Database and storage | `supabase/schema.sql`, `seed.sql`, `storage-setup.sql`, `migrations/`, `rewrite-lock-setup.sql` | [Operations](operations/runbook.md) |
| Verification | `src/lib/services/*.test.ts`, `package.json` scripts | [Testing guide](testing-and-change-guide.md) |
| Product history | `README.md`, `NEXT_STEPS.md`, `PLATFORM_HANDOFF.md`, `git log` | [Quickstart](quickstart.md) |

## Search strategy for future agents

Start with the relevant concept page, confirm behavior in the linked route/service/SQL, then inspect targeted recent history with `git log -- <path>` and `git show <commit> -- <path>`. Treat `PROJECT_HANDOFF.md` as partially stale when it conflicts with current source; the latest commit and current files win.
