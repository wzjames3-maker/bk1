# M5 Task 1 Report: Stripe SDK & Billing Services

## Status: DONE

## Commit
- Hash: `bf3fec1`
- Message: `feat: add stripe and billing services`

## Changes
1. **Installed Stripe SDK** (`stripe` package added to dependencies)
2. **Created `src/lib/services/stripe.ts`**
   - Stripe client initialization
   - `TOPUP_TIERS` constant (tier_5/$5, tier_10/$10, tier_20/$20)
   - `TierId` type export
   - `getTierById()` helper
3. **Created `src/lib/services/billing.ts`**
   - `preCharge()` — atomic balance deduction via `deduct_if_sufficient` RPC
   - `settle()` — post-completion settlement (refund/charge diff)
   - `refund()` — full refund on episode failure
   - `topup()` — credit balance via Stripe webhook

## Verification
- `npx tsc --noEmit`: ✅ PASSED (0 errors)
