# Private owner learning

## Purpose and access

This is a separate extension to the global product-reliability Learning Center.
`/admin/learning/owner` shows **private account-usage and commercial snapshots**.
It requires the exact configured, currently active main-database superadmin ID.
Other superadmins and tenant admins do not inherit access. Every read is audited
before data is returned; an audit failure blocks access. The existing aggregate
brief/export does not include these snapshots.

The operator authorized analysis of all tenants they currently own. Encode those
current tenant IDs explicitly; future tenants are NOT automatically included.
Changing owner, allowlist, activation time or policy version changes the scope
fingerprint. Old-scope results are not returned under a new scope. Suspended or
removed tenants cannot be selected or newly collected.

No external model calls, individual character/employee ratings, automatic pricing,
credit decisions or transaction changes. Account activity is not proof of personal
identity: shared accounts and unauthenticated kiosks cannot identify an individual.
The UI states this limitation. Users in the selected tenants receive an in-app
notice describing purpose, retention and how to request clarification/correction;
dismissing the notice is not treated as consent.

## Configuration

All variables are server-only. Default disabled; configure only after owner and
current registry have been verified through trusted administration:

- `OWNER_LEARNING_ENABLED=true`
- `OWNER_LEARNING_USER_ID`: exact main owner user ID, no email inference
- `OWNER_LEARNING_TENANT_IDS`: explicit comma-separated current owned tenant IDs
- `OWNER_LEARNING_POLICY_VERSION`: version of the approved scope
- `OWNER_LEARNING_ACTIVE_FROM`: prospective ISO timestamp with timezone
- `OWNER_LEARNING_SCOPE=private-owner-usage-commerce`

Derived snapshot retention is 90 days measured from **window start** so repeated
rolling windows do not prolong old individual observations beyond the retention
bound. Existing business records and original telemetry retention are unchanged.
Product-improvement follow-up retains its separate existing 180-day policy.

## Scheduling, evidence and bounds

Existing authenticated hourly learning cron invokes product and private-owner
jobs independently. Owner work processes at most three missing tenant snapshots
per invocation. Already-complete tenants do not use that budget. Configured but
inactive/missing tenants yield a partial failure rather than successful coverage.

Each tenant's daily snapshot covers up to 30 completed Jakarta days, bounded by
the first full day after activation. A missed day is not reconstructed; the next
snapshot contains the then-current rolling window. Windows overlap: do NOT sum
snapshots. Completion is immutable per tenant/owner/day/extractor/scope. A lease
and fenced conditional publish reject obsolete workers. Failures use fixed codes,
not raw queries/data in logs. Source queries run in explicit READ ONLY transactions;
main usage and tenant commercial sources are separate snapshots, not a distributed
atomic snapshot. Read errors do not become fabricated zero observations.

Caps (stable-key ordering, NOT rankings): 500 account/module rows, 200
customer/type/status groups, 300 price-basis groups, 200 region groups, and 300
physical-flow groups. Each returns a truncation indicator when exceeded. A failed
or stale run is visible even when an older successful snapshot remains available.
Strict validated JSON forbids arbitrary new columns; DB limits summary size to 1 MiB.

## Source contracts

### Account usage

Main `UsageEvent`, bound to the exact tenant ID and allowlisted feature/module/
event/source fields. Per-account/module view count, active days, mobile completed,
failed and retry events. No metadata, raw paths, session IDs or transcript reads.
Counts are best-effort events, not tasks, productivity or employee performance.
Names and roles are resolved only at authorized display time from the selected
tenant; names/emails are not copied into historical snapshots. IDs are still
sensitive and remain private owner data, not anonymized records.

### Customer orders

Use `OPERATIONAL_STATUSES`: CONFIRMED, IN_PRODUCTION, READY_TO_SHIP, SHIPPED,
DELIVERED. Exclude drafts, quotations and cancellations. Group customer, order type
and current status before any item join, preserving customers without IDs as a
separate unknown bucket. Dates use orderDate, with createdAt before window end.
This is current document state as observed, not the historical confirmation event.
`totalAmount` is labeled **recorded document value**, not net sales, paid cash or
profit; it can include tax/freight, be synchronized to delivered basis, or be null.
Null counts are explicit. Return credits are not subtracted from this metric.

### Prices

Preserve customer, variant, order type, unit basis, PPN mode, tax/discount rates,
price status and commercial review status. Prefer entered quantity/unit/price only
with complete positive conversion snapshots; otherwise use normalized primary
quantity/price and label the unit as current catalog metadata. Do not reconvert
history using today's conversion factor. Exclude free lines; keep explicit zero
price distinct from missing. Min/max are pre-discount recorded unit prices with
PPN according to mode, not weighted net price. Freight/payment terms are not
normalized, so this is descriptive history, not a recommendation or willingness-
to-pay estimate. No cross-tenant currency/value consolidation is performed.

### Physical flows and regions

Dispatch uses DeliveryOrder.stockCommittedAt and SHIPPED/IN_TRANSIT/ARRIVED/
DELIVERED/RETURNED. RETURNED remains gross historical dispatch, not a negative
quantity. Physical return uses SalesReturnReceiptLine.receivedAt and parent
RECEIVED/COMPLETED; GOOD/DAMAGED remain separate. Missing legacy receipt evidence
is unknown, not proof of no return. No double subtraction or finance-credit claims.
Each variant stays separate; primary-unit names are current master labels.

Regions use current customer master province/city strings and missingness, NOT GPS,
addresses or historical delivery destinations. These are recorded business areas,
not canonical geography or inferred market potential. Marketing attribution stays
unimplemented until source/exposure/outcome definitions are available; orders alone
cannot show campaign effectiveness.

## Product development feedback

Fixed recommendation codes flag observed mobile failures, retries, incomplete
region data and truncated coverage. They link back to the product Learning Center.
The owner validates the problem and transfers only a nonsensitive summary to the
normal development workflow: source investigation, synthetic regression, reviewed
release, measured outcome. Private customer/account rows are not copied into
external prompts or developer briefs. No automatic edits or publication.

## Verification and recovery

Regression suite includes closed payload validation, exact owner/tenant guards,
audit failures, lease/retention boundaries, and actual PostgreSQL queries with
colliding IDs in two disposable tenant databases. Existing CI replays migrations
before this contract. All normal release gates remain mandatory.

Disable only OWNER_LEARNING_ENABLED to stop this extension; global product
learning continues. Owned snapshot expiry still runs. Remove access by updating
owner/tenant policy; expired data is immediately hidden and removed in bounded
batches. Correct business/user master data through existing authorized application
flows; future snapshots/labels reflect corrections without rewriting frozen history.
Keep rollback config backups private. No production source records are changed or
deleted by these jobs.
