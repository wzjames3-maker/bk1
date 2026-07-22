# M6 Task 3 Report: Sentry Error Monitoring

## Status: DONE

## Commit
- Hash: `9957d9b`
- Message: `feat: add Sentry error monitoring`

## Changes
| File | Action |
|------|--------|
| `sentry.client.config.ts` | Created — client Sentry init with DSN guard, traces/replays sampling |
| `sentry.server.config.ts` | Created — server Sentry init with DSN guard, traces sampling |
| `src/app/global-error.tsx` | Created — 'use client' global error boundary with Sentry.captureException |
| `package.json` / `package-lock.json` | Updated — added `@sentry/nextjs` dependency |

## Verification
- `npx tsc --noEmit` — **PASSED** (0 errors)

## Notes
- Sentry is silently disabled when `SENTRY_DSN` env var is not set (guarded by `if (dsn)`)
- `global-error.tsx` calls `Sentry.captureException(error)` unconditionally (SDK is no-op without init)
- Client config includes session replay settings; server config uses traces only
