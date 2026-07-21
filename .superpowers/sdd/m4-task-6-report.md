# M4 Task 6 Report — Episode Detail Page

## Status: DONE

## Commit
- Hash: `80b8513`
- Message: `feat: add episode detail page with player, progress, script, and notes`

## Files Created / Modified
| File | Action |
|------|--------|
| `src/components/episode/show-notes.tsx` | Created — Show Notes component (节目简介 + 封面建议) |
| `src/components/episode/episode-detail.tsx` | Created — Episode Detail container with tabs, confirm/retry, script edit |
| `src/app/(app)/episodes/[id]/page.tsx` | Overwritten — Server page with Supabase fetch + force-dynamic |
| `src/app/(app)/episodes/[id]/loading.tsx` | Created — Skeleton loading state |
| `src/components/ui/skeleton.tsx` | Installed via shadcn CLI |

## Verification
- `npx tsc --noEmit`: ✅ passed, no type errors
- Tabs component: already existed
- Skeleton component: installed via `npx shadcn@latest add skeleton --yes`

## Notes
- `chapters` field guarded: only treated as `{time,title}[]` when `status === 'completed'` AND first element has `time` property.
- Page uses Next.js 16 async params pattern (`params: Promise<{ id: string }>` + `await params`).
