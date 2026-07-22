# M5 Task 3 Report: Usage API & Billing Integration

## Status: DONE

## Commit
- Hash: `287b9fd`
- Message: `feat: add usage API and integrate billing into pipeline`

## Changes

### 1. Created `src/app/api/billing/usage/route.ts`
- GET endpoint returning user balance, transactions, and usage records
- Supports `?limit=N` query param (default 50)

### 2. Overwrote `src/app/api/episodes/route.ts`
- Added `preCharge` integration in POST handler
- Pre-charges estimated cost after episode creation
- Returns 402 and deletes episode if balance insufficient

### 3. Modified `src/lib/pipeline/orchestrator.ts`
- Added `settle` call on pipeline completion (multi-refund/charge based on actual vs estimated)
- Added `refund` call on pipeline failure (full pre-charge refund)

## Verification
- `npx tsc --noEmit`: PASSED (0 errors)
