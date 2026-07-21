# M4 Task 3 Report — Pipeline Progress Timeline Component

## Status: DONE

## Commit
- Hash: `d774d0d`
- Message: `feat: add pipeline progress timeline component`

## What was done
- Created `src/components/episode/pipeline-progress.tsx`
- Vertical timeline component showing 6 pipeline steps (parsing, scripting, confirming, tts_processing, mixing, post_processing)
- Each step displays icon, status color (green=done, blue=running, red=failed, muted=pending), and timing info
- Uses `cn` utility and typed with `EpisodeStep` / `EpisodeStatus` from `@/types/database`

## Verification
- `npx tsc --noEmit` — passed with zero errors
