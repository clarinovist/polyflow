# Production cost seal hash contract

Receipt business versions are unchanged: **1 = STRICT**, **2 = REVIEWED_LEGACY_SEAL**.
`START_PRODUCTION_COST_PERIOD`, dedupe keys, historical balances, retained anomalies,
backup/audit transaction, and frozen execution rules retain their meanings.

## Dispatch and immutability

- No `hashVersion`: the frozen original scalar projection, shared by receipt v1/v2.
  Both original writers were introduced after the actual-packaging migration.
  The original shape contains 89 scalar columns across the six models.
  Preserve **all** those columns, including metadata, for old receipts.
- `hashVersion: COST_V1`: the explicit cost/evidence projection for new receipts
  of either business version. The format is included in the preview fingerprint.
- Anything else (including null): reject. Never retry a weaker projection after
  a mismatch, infer a format from today's schema, or rewrite/re-seal old receipts.

SHA-256 canonical JSON, Decimal JSON strings, UTC millisecond ISO dates, nulls,
source/journal/line sorting, DB id ordering for executions/support, account id/type,
ID-set/count checks, and cross-boundary reversal rejection are unchanged.
The approval `fingerprint` is still a preview/apply concurrency token, not a hash
that the historical verifier recomputes from a subsequently changed order.

## COST_V1 field decisions

Exact allowlists are in `cost-period-hash-projection.ts` and pinned by a test snapshot.

| Model | Protected evidence | Explicit exclusions for new receipts only |
| --- | --- | --- |
| StockMovement | All original fields: amounts, source links, locations, ownership, reference, creator/time | None |
| JournalEntry | Identity/number, accounting date, reference/link, status, auto-generation, creator/approval identity/time | description (display), updatedAt (generic edit timestamp) |
| JournalLine | Identity, parent/account, debit/credit, currency/rate, creation time; account type remains nested | description (display), reconciledAt (bank matching) |
| ProductionExecution | Identity/order/machine/operator/shift, quantities/UOM/conversion, bruto/bobin, event times, status, scrap quantities, piece-rate/earnings/type | clientRequestId/requestHash (request deduplication), cekGram (free-text display), notes/photoUrl (presentation), updatedAt (generic edit timestamp) |
| MaterialIssue | All original fields: identity, quantities, state, order/execution/source/batch/location, creator/time | None |
| ScrapRecord | Identity/order/execution/variant/location, quantity, creator/time | reason (free-text display) |

Excluded metadata is not a way to unlock execution edits: `assertMutableCostExecution`
and `closeOpenShellsForOrder` still protect/skip every sealed execution, regardless
of hash format. Legacy receipts still detect changes to excluded metadata too.

## Mandatory decision before changing any sealed model

The scoped `cost-period-hash-projection.test.ts` runs in the normal CI test shards.
It pins **complete schema model definitions**, including relations, attributes,
nullability, native Decimal precision, and dependent enums (also AccountType).
It reads `prisma/schema.prisma` directly: stale generated Prisma cannot bypass it.
The projection lists have a separate immutable snapshot.

For any schema change to these models:

1. Classify every added/changed/removed field and any semantic effect on historical
   costs. Record the decision here in the same patch; don't blindly update snapshots.
2. A non-cost additive field can stay outside both existing projections. Review
   the schema diff and intentionally update only the schema-contract snapshot.
3. A new cost-bearing field needs a **new hash format** for future receipts plus
   an explicit policy for old receipts. Keep old allowlists/serialization immutable.
   Historical fields not committed by an old seal cannot be retroactively attested;
   reject unsupported historical use rather than silently treating it as covered.
4. Removal/rename/type/precision/default/backfill changes need a compatibility
   reader that exactly reconstructs the original values, and read-only proof for
   every affected existing receipt. A snapshot update alone is not compatibility.
5. Test additions leave old hashes unchanged and every protected-field mutation,
   missing row, unknown format and reversal fails. Review the snapshot diff.
6. Re-run all-receipt read-only proof before requesting release. Never reseal or
   write production data to make proof pass. Keep tenant-specific evidence local.

## Release / rollback

This patch has no schema/data migration. All heavy release gates remain mandatory
in CI. A pre-patch binary cannot read COST_V1 receipts correctly: after the first
new receipt, rollback must retain this verifier or roll forward. Do not roll back
to an incompatible writer/verifier or remove an audit receipt as recovery.

## ATK correction relation additions (2026-10-29)

`StockMovement.atkCorrections/atkEvidence` and
`JournalEntry.atkSourceCorrections/atkCorrectionPosting/atkEvidence` are inverse
relations, not new scalar cost fields. Keep them outside **both** frozen hash
projections; no historical hash or receipt is rewritten. Only the complete-schema
snapshot changes. Existing scalar-projection and synthetic receipt hash snapshots
must remain byte-identical.

ATK correction values live in new typed documents and separate journals, never by
editing the original movement/journal. The bounded writer rejects movements with
production order/execution identity, returns, or mixed history. It is not a way to
change sealed production WIP. Supporting production-linked corrections later would
require a separate cost/evidence policy and is not covered by this exclusion.

## Decision history

- 2026-10-29: freeze original v1/v2 scalar shape; introduce COST_V1 using the
  exclusions above; preserve business receipt/audit and frozen-shell semantics.
