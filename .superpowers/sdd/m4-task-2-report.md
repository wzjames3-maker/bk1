# M4 Task 2 Report: useEpisodeRealtime Hook

## Status: DONE

## Commit
- **Hash:** `0c3f0e1`
- **Message:** `feat: add useEpisodeRealtime hook for live updates`

## What was done
- Created `src/lib/hooks/use-episode-realtime.ts`
- Hook subscribes to Supabase Realtime `postgres_changes` for:
  - `episodes` table (UPDATE) filtered by episode ID
  - `episode_steps` table (INSERT + UPDATE) filtered by episode ID
- Returns `{ episode, steps, isConnected }` for live UI updates
- Properly cleans up channels on unmount

## Verification
- `npx tsc --noEmit` — **PASSED** (zero type errors)
