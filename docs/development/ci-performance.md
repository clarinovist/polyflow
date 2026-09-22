# CI performance experiments

Production splits the complete suite across two independent runners, retaining default
workers and the original global thresholds **71/63/75/72**. The stable `test` gate merges
coverage and validates the full suite before release. Lint, shards, image build and the
PostgreSQL/typecheck contract run in parallel after the initial consistency/change
classification gate; all four gates remain required by deploy. Only pushes limited to
an explicit safe-document allow-list skip those heavy jobs. Manual production dispatch
runs full verification without release PR/deployment; see [selective CI](ci-selective.md).
Performance claims require paired hosted evidence, not individual shard durations.

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

The timing summary job is observational, runs only on the full path, and is not a deploy
gate. The separate **Status CI** check validates expected success/skip on both full and
documentation paths. Timing reports wall time through
completed jobs (including deployment), excluding its own job/post steps. Sum of job
occupancy is runner-minutes, **not wall time, billed rounded minutes or a price**.
For exact end-to-end workflow duration after completion, use GitHub's run
`created_at`/`updated_at`; on reruns, inspect the individual attempt timeline instead.
Keep final API results outside tracked files. Instrumentation overhead itself should be
included in the controlled comparison; the summary job adds a small extra runner charge.

## 2. Manual benchmark (no deployment)

`.github/workflows/ci-benchmark.yml` has only `workflow_dispatch`, read-only permissions,
no production secrets, no image publishing and no deployment job. Follow `AGENTS.md`
for current scope/authorization rules. GitHub may require a manual workflow to exist on
the default branch before dispatch; do not push `main` merely to register an experiment
(that triggers production). Use the existing registered workflow with an explicit
benchmark branch/SHA and record the exact dispatch inputs.

The dispatch input `strategy` selects the experiment explicitly. `all` retains the
original default + explicit-worker + shards comparison. Select `shards` for option A:
only the complete default suite and two shards run; no two-worker setting is applied.
The final comparison requires exactly the selected comparators, validates all original
identity/count/coverage checks, and rejects unknown strategies or unexpected artifacts.
A failed selected comparator still fails the entire benchmark.

Each approved dispatch runs the same checkout/lockfile on `ubuntu-latest`:

1. Default single full suite, global coverage enforced.
2. With `strategy=all` only: explicit hardware-aware worker candidate, full suite, same global coverage gate.
   Candidate = min(available CPU, floor((memory GiB − 2) / 1.5)), minimum one. This
   memory budget is a hypothesis to test, not a new production setting.
3. Two official Vitest shards with default workers and isolation unchanged. Each writes
   a blob with coverage. Partial maps do not enforce global percentages; the mandatory
   `shard-coverage` job invokes the **original** config and `--mergeReports --coverage`
   once. Vitest merges coverage maps/counters, never averages percentages or reruns tests.

The dependency paths are independent:

```text
candidates (default / explicit) ─────────────────┐
                                               ├─ test (final comparison gate)
shards (1/2 / 2/2) ── shard-coverage ────────────┘
```

`shard-coverage` requires **both shards to succeed**, but does not wait for comparators.
A failed experimental worker therefore cannot suppress otherwise-valid shard timings
and merged coverage. The final `test` gate always evaluates dependency results; failure,
cancellation or skip in either path makes it fail explicitly before downloading results.
If all jobs succeed, it compares all selected complete-suite results with the merged shard result.
A green shard gate with a failed comparator is **not** a green benchmark.

Missing/duplicate shards, foreign run/attempt/SHA/fingerprint, blob checksum mismatch,
incomplete/disjoint discovery, failed/pending tests, merge errors and global threshold
failure still prevent a successful shard gate. Full-suite discovery uses Vitest's
`list --filesOnly`, not a historical count. Merge checks replayed per-file counts against
collected shard counts; final comparison additionally checks every selected full-suite comparator.
The final comparison uses Node built-ins and JSON manifests only: no dependency install,
coverage recalculation or test execution. `globalCoveragePassed` is written only after
the official merge process exits zero, including threshold enforcement; the replay
reporter's `coverageGenerated` flag is not a substitute for that gate.

Artifact namespaces/download patterns separate `single-*`, `shard-*`, and the merged
`shard-coverage-*` result. Downloads stay in the current run, with exact attempt/SHA in
the names. Rerun the **whole benchmark**, not failed jobs only: mixed-attempt artifacts
intentionally fail. Artifacts expire after seven days.

Version evidence: installed `vitest --help --coverage --shard --mergeReports`, public
Reporter type declarations, BlobReporter/readBlobs and coverage-provider merge code
in **4.1.11**. The partial-coverage config is separate from the global coverage config. Revalidate these
contracts after a Vitest upgrade. Regression fixtures execute real complementary-branch
blob generation/merge, prove 100% combined coverage with no second test execution, and
prove low coverage, malformed blobs and failed tests return nonzero.

### Budget and decision

Start with **two dispatches**, approximately **40–70 Linux runner-minutes** total using
historical suite times for `strategy=all`. There are two comparator jobs (one with `strategy=shards`), two shard jobs, one shard merge,
a short final comparison gate and a summary per dispatch. This is an estimate, not
measured billing. Compare candidate job
critical paths plus aggregate setup/download/merge, not just test subprocess duration.
Runner pricing depends on the repository plan. Do not repeat identical local suites to
claim hosted performance. A third repetition needs a reason (e.g. results within runner
variance) and renewed budget agreement.

## 3. Production strategy decision

Production uses **two independent shards with default workers**. The stable `test`
job (`Test & Validate`) requires both shards and performs the official blob merge,
full discovery/count reconciliation, original global coverage thresholds, and Nginx
validation. Any shard failure/cancellation/skip fails the gate before artifact download.
`deploy` still requires `test`, `lint`, `build-and-push`, and `return-contract`.
Artifacts are bound to run ID, attempt, SHA and input fingerprint, retained for 14 days;
rerun the whole production workflow when retesting, not only failed shard jobs.

Compare wall-clock through the required merge (including queue/setup/download), complete
pipeline critical path, runner occupancy, memory, failures, coverage and test counts.
A faster test gate can expose image build as the new critical path. Benchmark paired
candidates on identical source/runtime; results from an earlier SHA are strategy evidence,
not proof that a later release passed. CPU/RAM variation and increased runner-minutes
must be reported alongside wall-time savings.

**Release identity:** deployments are serialized without cancelling an active deploy.
The revision guard rejects malformed identities, propagates API failures, and skips
superseded main revisions before registry/SSH operations. Build output supplies an
immutable digest; runtime checkout uses the tested SHA, and Compose receives that digest
through `POLYFLOW_IMAGE`. Without an explicit image, manual recovery retains the tested
`:latest` default. Set a verified digest explicitly for deterministic rollback. Dirty
tracked server files fail closed rather than being reset. Login/pull errors stop before
container recreation; no VPS build, forced pre-removal, image prune or database rollback
is part of this change. Post-deploy image/health verification remains required.

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

If sharding must be rolled back, restore the full single-suite coverage command in the
required `test` job and remove the shard dependency, retaining every release gate and the
SHA/digest deployment protections. Keep regression tests aligned with that explicit
strategy change. Worker defaults, coverage thresholds, Dockerfile/cache backend and
business data are unchanged; no data rollback is involved. The separate Next/Docker
cache experiment remains blocked and is not required for the two-shard strategy.
