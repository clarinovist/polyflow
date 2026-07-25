# Plan: PO vs GR & SO vs DO Qty Variance — Invoice Berdasarkan Qty Fisik Nyata

**Date:** 2026-07-26
**Status:** ✅ IMPLEMENTED (v0: b1c720c4, residual gaps fixed: pending commit)
**Requestor:** Pak Akhmad (PO 250kg → datang 247/252) + SO extension (SO dipesan X, dimuat Y → tagih Y)

## What landed (b1c720c4)
- `calculatePoInvoiceTotalFromReceipts`: sum(receivedQty×unitPrice×disc×PPN)+shipping, fallback po.totalAmount when no GR
- `calculateSalesInvoiceTotalFromDelivered`: sum(deliveredQty×unitPrice×disc×PPN)+DO shipping charge
- `createDraftBillFromPo` + `createDraftInvoiceFromOrder`: upsert (old: skip when exists)
- `LoadVerifyPanel` + `correctDeliveryQtyToVerified` action
- 1888 tests green initially

## Residual gaps fixed in this commit
- **#1 shipping-sync race**: `syncSalesOrderShippingFromDeliveries` was using `goodsSubtotal = SO.totalAmount - oldShipping` (ordered) → overwrote delivered-based invoice. Now: when deliveredQty>0, goodsSubtotal from delivered qty via local calc, goodsBasis=DELIVERED, and DRAFT invoice NOT overwritten by shipping-sync (invoice-lifecycle is source of truth).
- **#2 upsert policy aligned**: PO was updating UNPAID regardless of paidAmount. Now: only DRAFT or UNPAID with paidAmount==0 auto-sync. Paid>0 blocked (consistent with SO DRAFT-only). PO paid>0 and SO UNPAID already get supplementary DRAFT for remaining delta (#3).
- **#3 multi-DO with UNPAID**: when delivered total > existing locked invoice (UNPAID/PARTIAL/OVERDUE), auto-create supplementary DRAFT invoice for remaining amount, both PO and SO sides.
- **#4 reverseGoodsReceipt**: after tx commit, now calls `createDraftBillFromPo` to recalc DRAFT bill from remaining GRs.
- **#7 allow 0 qty**: `saveDeliveryLoadVerificationSchema` positive→min(0), `commitDeliveryShipment` allows needed==0 skip stock, returns SHIPPED with 0 increment (all lines 0 case handled).
- **#8 auto-journal**: sales invoice handler now uses `deliveredQty` for revenue split when available, fallback to ordered qty.
- **Backfill scripts**: `scripts/recalc-purchase-invoices-from-gr.ts` and `scripts/recalc-sales-invoices-from-delivered.ts` dry-run + --apply (only DRAFT / UNPAID-paid0 for PO, DRAFT for SO).

## Remaining (out of scope / needs biz decision)
- Purchase Return / Sales Return reducing invoice: currently credit note separate (plan says V1 credit separate).
- DO cancel / reverse path for SO invoice recalc: no DO reverse action yet.
- Return qty 0 tolerance config: one-click correction enough V1.
- Plan doc full version in git history.

## Backfill usage
```bash
npx tsx scripts/recalc-purchase-invoices-from-gr.ts        # dry-run
npx tsx scripts/recalc-purchase-invoices-from-gr.ts --apply # fix DRAFT + UNPAID-paid0
npx tsx scripts/recalc-sales-invoices-from-delivered.ts
npx tsx scripts/recalc-sales-invoices-from-delivered.ts --apply
```

## DoD
- [x] 1888 tests pass
- [x] lint clean
- [x] build green
- [x] backfill scripts
- [x] plan doc
