# Payment Model Audit

This note records the current state of payment modeling after the purchase payment canonicalization fix.

## Current Decision

Use `Payment` as the canonical payment record for both:

- customer payments against `Invoice`
- supplier payments against `PurchaseInvoice`

`PurchasePayment` remains in the Prisma schema as a legacy model, but it should no longer be the primary runtime source for new purchase payment flows.

## Why This Matters

Before the fix, purchase payment handling had a dangerous split:

1. purchasing service wrote supplier payments into `PurchasePayment`
2. finance payment views and invoice deletion logic used `Payment`
3. auto-journal purchase payment logic loaded by `prisma.payment.findUnique`

That meant a supplier payment could update invoice balances but fail to produce a payment journal because the returned ID belonged to `PurchasePayment`, not `Payment`.

## Fixed Runtime Direction

The current runtime path is:

1. `recordPayment` in `src/services/purchasing/invoices-service.ts` creates a `Payment`
2. the returned `paymentId` is a canonical `Payment.id`
3. `AutoJournalService.handlePurchasePayment` loads that `Payment`
4. purchase payment journal entries use `ReferenceType.PURCHASE_PAYMENT` and `referenceId = payment.id`
5. invoice deletion and payment deletion clean up journals and `Payment` rows consistently

## Remaining Legacy Surface

`PurchasePayment` still exists in the schema and is still related from:

- `User.purchasePayments`
- `PurchaseInvoice.purchasePayments`

As long as those relations remain, treat them as legacy compatibility surface only.

## Recommendation

Short term:

1. Keep new behavior on `Payment`
2. Avoid writing any new flows against `PurchasePayment`
3. Prefer `purchaseInvoice.payments` for read paths

Medium term:

1. Audit whether historical data still exists only in `PurchasePayment`
2. If yes, design a one-time backfill or compatibility read strategy
3. If no, remove `PurchasePayment` from schema and dependent legacy relations in a dedicated migration