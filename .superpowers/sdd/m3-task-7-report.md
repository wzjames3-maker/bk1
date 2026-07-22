# M3 Task 7 Report: Pipeline API Routes + Episode Creation Integration

## Status: COMPLETE

## Commit
- Hash: `d75212e`
- Message: `feat: add pipeline API routes and integrate with episode creation`

## Changes

### Created Files

1. **`src/app/api/pipeline/advance/route.ts`**
   - Registers all 6 step executors (parse, script, confirm, tts, mix, post)
   - POST handler with `x-pipeline-secret` header authentication
   - Upstash Redis concurrency lock (1 concurrent pipeline per user, 300s TTL)
   - Calls `advancePipeline` with episodeId, userId, step, attempt
   - Handles `WAITING_FOR_CONFIRMATION` as non-error response

2. **`src/app/api/episodes/[id]/confirm/route.ts`**
   - Next.js 16 async params: `{ params }: { params: Promise<{ id: string }> }` + `await params`
   - Validates episode belongs to current user and status is `script_ready`
   - Triggers `tts_processing` step via internal fetch with `x-pipeline-secret`

3. **`src/app/api/episodes/[id]/retry/route.ts`**
   - Next.js 16 async params pattern
   - Validates episode status is `failed` and has `failed_at_step`
   - Triggers retry of the `failed_at_step` via internal fetch with `x-pipeline-secret`

### Modified Files

4. **`src/app/api/episodes/route.ts`**
   - Added fire-and-forget pipeline trigger after episode creation
   - Triggers `parsing` step with `.catch(() => {})` to not block the response

## Verification
- `npx tsc --noEmit`: 0 errors
