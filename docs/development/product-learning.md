# Product learning: from observations to verified development work

## Delivered scope

`/admin/learning` is an active-superadmin-only review surface for **global,
restricted product-reliability aggregates**. Main database only; no tenant
business queries, identity enrichment, raw conversations, event metadata, paths,
external model calls, individual profiles or automatic code/business changes.
Global aggregates are **not claimed anonymous**, particularly with small cohorts.
Marketing, materials/demand, pricing and business regions are future domains,
not active extractors or predictions.

## Daily execution and activation

The release installs an owned, idempotent cron block calling
`scripts/run-product-learning.mjs` inside the app container at minute 23 hourly.
It uses loopback with the root Host header (not the admin host, whose login
middleware would redirect), runtime `CRON_SECRET`, no redirect following and a
four-minute timeout. `CRON_SECRET` is required even while aggregation is disabled
for authenticated expiry cleanup; release validates its presence and root-host
configuration in the candidate image before migration or container replacement.
No token is passed through argv or printed. Hourly calls
provide retries; observations cover **completed Asia/Jakarta calendar days**, not
hourly user profiles. A maximum seven-day catch-up prevents unbounded work.

The feature is **default-off**. An owner-approved activation policy must specify:
permitted source/purpose, restricted global dimension, readers, small-cohort risk
acceptance, retention, and prospective activation time. Technical access to
central telemetry is not sufficient authorization. Configuration is server-only:

| Variable | Requirement |
| --- | --- |
| `PRODUCT_LEARNING_ENABLED` | Exactly `true` after approval; otherwise disabled |
| `PRODUCT_LEARNING_POLICY_VERSION` | 3–64 alphanumeric/underscore/hyphen characters identifying the approved policy |
| `PRODUCT_LEARNING_SCOPE` | Exactly `restricted-global-product-reliability` |
| `PRODUCT_LEARNING_ACTIVE_FROM` | Approved ISO timestamp with timezone; only complete days after it are eligible |
| `PRODUCT_LEARNING_RETENTION_DAYS` | Explicit 30–90 days; no implicit policy default |
| `PRODUCT_LEARNING_CLOSED_RETENTION_DAYS` | Explicit 30–365 days after closure; no implicit policy default |

These ranges are supported configuration limits, not legal advice or approval.
Change policy version when definitions/authorization change; do not reinterpret
old evidence. Failed runs from an earlier policy on the same day are a visible
policy conflict, not overwritten silently. Do not backdate activation as an
informal historical-data import.

Each invocation also deletes expired **learning-owned** records in bounded
batches, including when aggregation is disabled. Source telemetry and its existing
retention are untouched. Expired observations are hidden immediately; deleting a
run cascades only to its observations. Open work expires unless new qualifying
observations refresh it. Closed work retains its frozen summary for the approved
closed-retention interval. Governance audit follows the existing audit policy.
The cron log contains only job state/count or a fixed failure code; operational
log retention follows the host's existing policy.

## Evidence semantics

Version `product-reliability-v1` produces three fixed scalar ratios:

- **Help failure share:** `FAILED + PARTIAL` / `SUCCESS + FAILED + PARTIAL` in
  `HelpInteraction`, web/telegram only. BLOCKED/ESCALATED are not assumed defects.
  These outcome labels are heuristic, not independently verified answer quality.
- **Mobile failure share:** `MOBILE_TASK_FAILED` / `MOBILE_TASK_FAILED +
  MOBILE_TASK_COMPLETED` for allowlisted registry feature/module values.
- **Unmapped view share:** unmapped `FEATURE_VIEW/MOBILE_PAGE_VIEW` / all such
  allowlisted view events. No raw path is retrieved.

Unknown registry/source values are excluded. Usage must have both occurred and
been recorded before the window end. Feedback is excluded because it is mutable
without a feedback timestamp. Successful snapshots are immutable; later source
changes do not rewrite them. Event ingestion is best-effort and not durably
unique: counts are **events**, not unique people/tasks or complete activity.

At least 20 denominator events and a ratio of 20% (help/mobile) or 10%
(instrumentation) create an **investigation candidate**. These are versioned
engineering heuristics, not statistical-significance or anonymity thresholds.
Zero/low data is shown explicitly. A stable policy/rule/metric key prevents daily
backlog duplicates; repeated signals never reopen rejected/evaluated work.

## Make learning affect product development

1. Owner opens a relevant finding and validates whether instrumentation, an
   application defect, or a guidance gap explains the signal. Do not infer root
   cause from the ratio alone.
2. Accept for investigation or reject. Review mutations validate active main-DB
   superadmin state, use conditional transitions and same-transaction audit.
3. Download a module-filtered brief (`assistant`, `mobile`, `analytics`) from the
   authenticated export. Keep it in a local ignored plan; do not commit or send
   it to external evaluators/children without appropriate data-scope permission.
4. Developer records the finding ID, investigates source, creates a synthetic
   regression test, applies the smallest fix and follows normal review/CI gates.
5. After verified deployment, reviewer records the exact 40-character commit SHA
   and `src/**/<name>.test.ts(x)` or `.spec.ts` regression path. These are reviewer
   declarations, **not an automated assertion that CI passed or the SHA deployed**.
6. The system freezes seven complete baseline days preceding this recording and
   compares them with seven complete days starting the following Jakarta day.
   Record promptly after deployment; prior traffic may otherwise be contaminated.
7. Missing/expired days, mismatched definitions or fewer than 50 events in either
   window produce `INCONCLUSIVE`. A change of at least five percentage points is
   descriptive `IMPROVED_OBSERVED_METRIC` or `REGRESSED`; otherwise `UNCHANGED`.
   Traffic mix, seasonality and measurement loss remain confounders. **No result
   establishes causality or overall product/business improvement.**

Do not close the loop merely because a proposal was approved or a commit shipped.
Review the post-change result and decide whether further investigation is needed.
This first slice intentionally supports one intervention per item; it is not an
experiment-management platform.

## Operations and recovery

`/api/cron/learning` requires existing constant-time cron bearer authentication.
Snapshots use a unique day/version key, claim lease, token fencing and an atomic
transaction for observations/findings/completion. Crashes roll back partial
results; expired claims can be retried. Database errors are recorded as fixed
codes, never raw queries/data. Empty data can still be a successful job, but is
not healthy-product evidence.

The Learning Center distinguishes disabled, invalid policy, awaiting a complete
day, stale, failed and current data. Inspect it and the owned job log after
release. Source or claim failures return non-2xx from the route/caller so existing
job monitoring can detect them. If monitoring is not configured on the host,
this page/log does not itself send alerts.

For rollback: disable aggregation, keep expiry cleanup running, and revert the
app to a compatible verified artifact. The additive schema may remain; do not
undo it by deleting production evidence. The cron installer saves a mode-0600
backup under the operator's local state directory and preserves unrelated jobs.
Remove only its marked block if rolling back to an image without the invocation.
Do not restore the entire crontab blindly over later edits.

## Validation

Local tests cover policy defaults, calendar boundaries, deterministic rules,
source-column exclusions, authorization, state transitions, UI errors and
scheduler merging. The existing assistant PostgreSQL contract job additionally
replays all migrations and tests concurrent runs/reviews, audit rollback,
lease recovery, main/tenant separation and expiry using disposable databases.
Normal release lint/typecheck/coverage/JEV, both PostgreSQL contracts, worker
smoke, Nginx and immutable image gates remain required. Disabled deployment,
live activation, first successful daily snapshot and measured outcomes are
separate milestones and must be reported separately.
