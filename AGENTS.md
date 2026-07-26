# AGENTS.md

This file provides guidance to Lingma (lingma.aliyun.com) when working with code in this repository.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commands

```bash
npm run dev          # Start dev server (Turbopack, port 3000)
npm run build        # Production build
npm run lint         # ESLint (eslint.config.mjs, flat config)
npx tsc --noEmit     # Type check (strict mode)
npx playwright test  # E2E tests (playwright.config.ts)
```

Unit tests use inline `npx tsx` assert scripts (no test framework):
```bash
npx --yes tsx -e "import { fn } from './src/lib/services/file.ts'; console.assert(fn(input) === expected)"
```

Test files exist at `src/lib/services/*.test.ts` — run individually:
```bash
npx --yes tsx src/lib/services/script-parser.test.ts
```

## Architecture

**PodForge** is an automated podcast production SaaS. Users submit topics/scripts → AI generates a podcast script → TTS synthesizes voices → FFmpeg mixes audio → output is a complete episode with show notes.

### Pipeline (core business logic)

The pipeline is a **chain of independent serverless steps**, not a long-running process:

```
parsing → scripting → [script_ready: user confirms] → confirming → tts_processing → mixing → post_processing → completed
```

- `src/lib/pipeline/state-machine.ts` — valid status transitions (DAG, any step can → `failed`)
- `src/lib/pipeline/orchestrator.ts` — executes one step, returns `nextStep`; the **route layer** (`src/app/api/pipeline/advance/route.ts`) releases the Redis lock then fires the next invocation via HTTP self-call
- `src/lib/pipeline/steps/` — one file per step (parse, script, tts, mix, post, confirm)
- Each step registers via `registerStep(name, executor)`

Key invariant: **no step holds a lock while calling the next step**. The route releases the lock first, then triggers advancement. This prevents deadlocks in serverless.

### Concurrency Control

- **Upstash Redis** distributed lock (`SET NX EX 300`) guards pipeline advancement and episode operations
- `src/lib/rate-limit.ts` — sliding-window rate limiter (fail-open when Redis unavailable)
- DB-level atomic RPCs for rewrite/confirm: `claim_episode_rewrite`, `complete_episode_rewrite`, `release_episode_rewrite_lock`, `confirm_episode_for_tts` (defined in `supabase/rewrite-lock-setup.sql`)

### Supabase Clients (4 variants)

| File | Use case |
|------|----------|
| `src/lib/supabase/client.ts` | Browser (cookie-based auth) |
| `src/lib/supabase/server.ts` | Server Components + API routes (user-scoped) |
| `src/lib/supabase/admin.ts` | Service-role (bypasses RLS, pipeline steps) |
| `src/lib/supabase/middleware.ts` | Session refresh in proxy |

### Request Lifecycle

`src/proxy.ts` (NOT `middleware.ts` — Next.js 16 convention) handles every request:
1. Rate-limit `/api/*` routes (30 req/min per user, excludes `/api/pipeline/`)
2. Refresh Supabase auth session

### Services Layer (`src/lib/services/`)

| Service | Responsibility |
|---------|---------------|
| `deepseek.ts` | LLM calls (script generation, rewrite, polish) via OpenAI-compatible API |
| `style-presets.ts` | 4 podcast style presets injected into LLM system prompt |
| `tts-router.ts` / `tts-mimo.ts` | TTS engine routing (MiMo primary) |
| `ffmpeg.ts` | Audio mixing, BGM overlay, loudness normalization |
| `billing.ts` | Atomic pre-charge / settle / refund via Postgres RPC |
| `cost.ts` | Server-side cost estimation (never trust client values) |
| `script-parser.ts` | User-submitted script parsing (structured dialog vs plain text) |
| `voice-matcher.ts` | LLM-driven voice-to-role assignment |
| `show-notes.ts` | Structured show notes (summary/highlights/chapters) |
| `stripe.ts` | Lazy-initialized Stripe client (env vars may be absent in dev) |

### Frontend Patterns

- **UI components**: shadcn/ui (`src/components/ui/`) + Lucide icons (no emoji in UI)
- **Toasts**: `sonner` (never use `alert()`)
- **Theme**: `next-themes` with dark mode support
- **Realtime**: `src/lib/hooks/use-episode-realtime.ts` — Supabase Realtime + polling fallback for pipeline progress
- **State**: Server Components fetch data; client components use `useState`/`useEffect` with debounced search
- **Select components**: Base UI Select — pass `null` (not `undefined`) for controlled empty value; always provide explicit children to `SelectValue` (lazy rendering issue)

### Billing Model

Pre-charge → pipeline runs → settle (actual cost) or refund (failure). All balance operations are atomic Postgres RPCs (`deduct_if_sufficient`, `adjust_balance`). Refund is idempotent via `refunded_at` column guard.

## Database

- Schema: `supabase/schema.sql` (tables, RLS policies, triggers)
- Migrations: `supabase/migrations/` (numbered, applied via `supabase db push` or Management API)
- `handle_new_user()` trigger auto-creates profile + default project on signup
- All tables have RLS; pipeline uses service-role client

## Key Conventions

- Path alias: `@/*` → `./src/*`
- Episode status enum: `pending | parsing | scripting | script_ready | confirming | tts_processing | mixing | post_processing | completed | failed`
- API routes return `NextResponse.json()`; errors use `{ error: string }` shape
- `serverExternalPackages` in next.config: `pdf-parse`, `fluent-ffmpeg`, `@ffmpeg-installer/ffmpeg`
- Sentry wraps next.config via `withSentryConfig` (org: wzjames)
- PowerShell environment: use `;` not `&&`; prefix commands with `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links to architecture, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
