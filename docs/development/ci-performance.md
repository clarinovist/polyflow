# CI performance experiments

The production test gate remains one complete `vitest run --coverage`, with default
workers and the original global thresholds **71/63/75/72**. Lint, test and image build
remain parallel; deploy still requires all three. No measured strategy has yet
replaced that gate. This instrumentation is not a claim of a faster pipeline.

## 1. Baseline and instrumentation

Before comparing results, record commit SHA, lock/config fingerprint, Node/Vitest,
runner image version, architecture, available CPU and memory. `metrics.mjs hardware`
prints only these allowlisted fields, not environment variables or command arguments.
`timing-reporter.mjs` logs the effective run-mode worker limit (Vitest 4.1), pool and
isolation. A worker limit is not a measurement of concurrent workers at every instant.

The command wrapper preserves failure and signal status and samples summed process-tree
RSS once per second. RSS can double-count shared pages and miss short peaks; zero
samples means unavailable, not zero memory. This is not whole-runner/cgroup peak memory.

Timing definitions (seconds):

- `init-through-last-module`: initialization/scheduling/imports/test execution through
  the last module callback. Coverage capture during tests remains in this interval.
- `coverage-generation-tail`: last module callback to `onCoverage` (generation/remapping
  plus pool/finalization overhead), **not** a pure CPU profile of coverage.
- `report-and-teardown`: `onTestRunEnd` to process exit, including report rendering,
  threshold checking and teardown. The command wrapper measures total wall time.
- Timeline: GitHub job/step timestamps include setup-node/npm cache restore, install,
  image build/push and post-job cache work. BuildKit log parsing extracts registry
  cache import/export vertex durations; lazy layer downloads may occur during build,
  so import-manifest duration is not all cache transfer time. Missing data stays missing.

The summary job is observational and is not a deploy gate. It reports wall time through
completed jobs (including deployment), excluding its own job/post steps. Sum of job
occupancy is runner-minutes, **not wall time, billed rounded minutes or a price**.
For exact end-to-end workflow duration after completion, use GitHub's run
`created_at`/`updated_at`; on reruns, inspect the individual attempt timeline instead.
Keep final API results outside tracked files. Instrumentation overhead itself should be
included in the controlled comparison; the summary job adds a small extra runner charge.

## 2. Manual benchmark (no deployment)

`.github/workflows/ci-benchmark.yml` has only `workflow_dispatch`, read-only permissions,
no production secrets, no image publishing and no deployment job. Approval to edit does
not authorize committing, pushing its branch or dispatching it. GitHub may require a
manual workflow to exist on the default branch before it can be dispatched; do not push
`main` merely to register it (that triggers production). Agree on safe registration or
an isolated benchmark repository before any remote write.

Each approved dispatch runs the same checkout/lockfile on `ubuntu-latest`:

1. Default single full suite, global coverage enforced.
2. Explicit hardware-aware worker candidate, full suite, same global coverage gate.
   Candidate = min(available CPU, floor((memory GiB − 2) / 1.5)), minimum one. This
   memory budget is a hypothesis to test, not a new production setting.
3. Two official Vitest shards with default workers and isolation unchanged. Each writes
   a blob with coverage. Partial maps do not enforce global percentages; the mandatory
   aggregate job invokes the **original** config and `--mergeReports --coverage` once.
   Vitest merges coverage maps/counters, never averages percentages or reruns tests.

A missing/failed candidate skips the aggregate gate (not success). Missing/duplicate
shards, foreign run/attempt/SHA/fingerprint, blob checksum mismatch, incomplete/disjoint
file discovery, failed/pending tests, merge errors and global threshold failure all
prevent a successful benchmark gate. Full-suite discovery is obtained with Vitest's
`list --filesOnly`, not a historical file-count constant. Results/counts per file must
also match both complete-suite comparators after merge. Artifacts are from the current
run only, named with run/attempt/SHA; rerun the **whole benchmark**, not failed jobs only,
because mixed-attempt artifacts intentionally fail. Artifacts expire after seven days.

Version evidence: installed `vitest --help --coverage --shard --mergeReports`, public
Reporter type declarations, BlobReporter/readBlobs and coverage-provider merge code
in **4.1.11**. The config is intentionally separate from production. Revalidate these
contracts after a Vitest upgrade. Regression fixtures execute real complementary-branch
blob generation/merge, prove 100% combined coverage with no second test execution, and
prove low coverage, malformed blobs and failed tests return nonzero.

### Budget and decision

Start with **two dispatches**, approximately **40–70 Linux runner-minutes** total using
historical suite times. There are four candidate jobs and one aggregate job per dispatch,
plus a short summary. This is an estimate, not measured billing. Compare candidate job
critical paths plus aggregate setup/download/merge, not just test subprocess duration.
Runner pricing depends on the repository plan. Do not repeat identical local suites to
claim hosted performance. A third repetition needs a reason (e.g. results within runner
variance) and renewed budget agreement.

## 3. Production strategy decision

Retain default single-suite testing until comparable hosted evidence exists. Compare:
wall-clock to test gate, complete pipeline critical path, occupied/billed runner-minutes,
peak sampled memory, failures, coverage/count reconciliation and artifact complexity.
Reject samples with different source/dependencies/runner class; record CPU/RAM variation.
A faster test gate may simply expose image build as the critical path. Do not promise a
five-minute pipeline or choose shards just because individual jobs are shorter.

**Existing deployment hazard is unresolved:** tested SHA is promoted to `latest`, but
remote checkout follows `origin/main` and compose consumes `latest`, without deployment
serialization. This predates instrumentation. Do not integrate a new production strategy
and call the deployment SHA-safe without separately reviewing the local ops runbook,
pinning the deployed image (prefer digest), checking out the same tested SHA, serializing
active deployments without cancellation, and preventing an older queued run from replacing
a newer deployment. Such changes need a plan extension and deployment failure-path tests;
no database or production operation is authorized by this document.

## 4. Next/Docker cache experiment — blocked pending Docker access

Installed **Next 16.3.3** enables build filesystem caching by default under
`.next/cache/turbopack`. See the installed guides:
`node_modules/next/dist/docs/01-app/02-guides/ci-build-caching.md` and
`01-app/03-api-reference/05-config/01-next-config-js/turbopackFileSystemCache.md`.
The current Docker build does not explicitly restore this cache across ephemeral builders.
A `RUN --mount=type=cache` alone is **not** registry-cache persistence.

Do not change the production backend/mode or Dockerfile until this protocol can run:

1. Baseline current Dockerfile with empty isolated builder/cache, then registry-warm
   build on a **fresh** builder, same source/dependencies/platform/runtime. Record compile,
   typecheck, tooling/Prisma, image export/push and cache restore/export separately.
2. Prototype explicit cache-only exporter/importer: export only `.next/cache` from the
   successful builder as a separate artifact; restore to the next fresh BuildKit builder
   via a named context/bind mount into `.next/cache` before `next build`. Never restore
   `.next/standalone`, `.next/static` or an entire developer `.next` directory as output.
   Cache transfer must be explicit and verifiable, independent of registry layer cache.
3. Namespace keys by cache format, lockfile, exact runtime/base image, platform/arch,
   Next/build configuration and relevant public build inputs. Source SHA suffix produces
   immutable entries; compatible prefix fallback allows recompiling changed source.
   Store only trusted CI-generated compilation cache; no environment/secret files, data
   cache or local developer caches. Use a fresh worktree/context without `.env` inputs.
4. Build unchanged then changed source on fresh builders; verify image revision/digest
   and observable changed output. Missing cache must compile cold. Corrupt cache must be
   discarded and rebuilt cold, without treating a source/type error as a cache success.
5. Only then compare mode=max transfer cost with alternatives, two paired cold/warm runs
   to begin with. Keep baseline mode=max until measured total critical-path and transfer
   savings justify changing it. No registry credentials or VPS build is needed for local
   correctness experiments; hosted registry experiments need explicit approval.

Layer review: Prisma generation can precede broad source COPY if its schema/config and
package inputs are complete. Ops compilation must include all six operational entrypoints
and their transitive shared cores (including seed-coa); moving only entrypoints is unsafe.
Evaluate a dedicated ops stage against the current output contract, retaining TypeScript
checks and all current runtime CLIs. Source/test typechecking must not be narrowed.

Docker daemon availability and hosted benchmark approval are explicit blockers. Neither
local `npm run build` nor unchanged-source Docker layer hits prove this cache protocol.
No production cache optimization has been applied or performance benefit claimed.

## Rollback and handoff

Remove/revert only the instrumentation/benchmark workflow, helper scripts and config
tests from this patch. Production worker defaults, coverage config, Dockerfile and cache
backend are unchanged; no data rollback is involved. Before production integration,
resolve the deployment hazard and complete the blocked hosted/Docker verification.
