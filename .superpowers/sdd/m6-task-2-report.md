# M6 Task 2 Report: PostHog Analytics Integration

## Status: DONE

## Commit
- Hash: `58f5f7f`
- Message: `feat: add PostHog analytics integration`

## Changes
| File | Action |
|------|--------|
| `src/lib/posthog.ts` | Created — PostHog init helper with env-guard |
| `src/components/posthog-provider.tsx` | Created — Client-side provider using useEffect |
| `src/app/layout.tsx` | Overwritten — Wrapped children with PostHogProvider |
| `package.json` / `package-lock.json` | Updated — added `posthog-js` dependency |

## Verification
- `npx tsc --noEmit` — **PASSED** (0 errors)

## Notes
- PostHog is silently disabled when `NEXT_PUBLIC_POSTHOG_KEY` is not set.
- All PostHog code runs client-side only (initialized inside `useEffect`).
