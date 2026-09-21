import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { explicitWorkers, hardware, timed } from '../../../../scripts/ci/metrics.mjs';
import { identity, reconcile, validateReports } from '../../../../scripts/ci/benchmark.mjs';
import TimingReporter from '../../../../scripts/ci/timing-reporter.mjs';
import base from '../../../../vitest.config';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml'); // Already installed via ESLint; no new dependency.
const { summarize, cacheTimings } = require('../../../../scripts/ci/timeline.cjs');
const production = load(readFileSync(resolve('.github/workflows/production.yml'), 'utf8'));
const benchmark = load(readFileSync(resolve('.github/workflows/ci-benchmark.yml'), 'utf8'));
const expected = { run: '123', attempt: '2', sha: 'a'.repeat(40), fingerprint: 'lock' };
const file = (name: string) => ({ file: name, passed: 1, failed: 0, skipped: 0, pending: 0 });
const report = (shard: string, name: string) => ({ ...expected, shard, candidate: 'shards',
    exitCode: 0, reason: 'passed', errors: 0, coverageGenerated: true, files: [file(name)] });
const reports = () => [report('1/2', 'a'), report('2/2', 'b')];

describe('CI performance guardrails', () => {
    it('keeps production parallel and gated on original jobs plus the return transaction contract', () => {
        expect(production.jobs.deploy.needs).toEqual(['test', 'lint', 'build-and-push', 'return-contract']);
        for (const name of ['test', 'lint', 'build-and-push', 'return-contract']) {
            expect(production.jobs[name].needs).toBeUndefined();
            expect(production.jobs[name]['continue-on-error']).toBeUndefined();
        }
        const command = production.jobs.test.steps.find((s: any) => s.name === 'Run Tests with Coverage').run;
        expect(command).toContain('vitest run --coverage');
        expect(command).not.toMatch(/--shard|--maxWorkers|--exclude|--no-isolate/);
        expect(production.jobs.deploy.if).toBeUndefined(); // default success(), not always()
        const contract = production.jobs['return-contract'];
        expect(contract.services.postgres.image).toBe('postgres:15-alpine');
        expect(contract.services.postgres.ports).toEqual(['55439:5432']);
        for (const step of contract.steps) expect(step['continue-on-error']).toBeUndefined();
        const commands = contract.steps.map((step: { run?: string }) => step.run ?? '').join('\n');
        expect(commands).toContain('setup-return-test-db.mjs');
        expect(commands).toContain('tsc --noEmit');
        expect(commands).toContain('quick-sales-return-postgres.test.ts');
        expect(commands).toContain('sales-return-receipt-postgres.test.ts');
        expect(commands).toContain('manual-return-credit-postgres.test.ts');
    });

    it('preserves global coverage thresholds and discovery', () => {
        expect(base.test?.coverage?.thresholds).toEqual({ statements: 71, branches: 63, functions: 75, lines: 72 });
        expect(base.test?.include).toEqual(['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts']);
        expect(base.test?.isolate).not.toBe(false);
    });

    it('cannot deploy or publish and uses exact run/attempt/SHA artifacts', () => {
        expect(Object.keys(benchmark.on)).toEqual(['workflow_dispatch']);
        expect(benchmark.permissions).toEqual({ contents: 'read', actions: 'read' });
        expect(benchmark.concurrency['cancel-in-progress']).toBe(false);
        expect(benchmark.jobs.candidates.needs).toBeUndefined();
        expect(benchmark.jobs.shards.needs).toBeUndefined();
        expect(benchmark.jobs.shards.strategy['fail-fast']).toBe(false);
        expect(benchmark.jobs.shards.strategy.matrix.include.map((entry: any) => entry.shard)).toEqual(['1/2', '2/2']);
        expect(benchmark.jobs.candidates.strategy.matrix.include.map((entry: any) => entry.candidate)).toEqual(['default', 'explicit']);
        expect(benchmark.jobs['shard-coverage'].needs).toBe('shards');
        expect(benchmark.jobs['shard-coverage'].if).toBeUndefined();
        expect(benchmark.jobs.test.needs).toEqual(['candidates', 'shard-coverage']);
        expect(benchmark.jobs.test.if).toBe('${{ always() }}');
        expect(benchmark.jobs.candidates.strategy['fail-fast']).toBe(false);
        const text = JSON.stringify(benchmark);
        expect(text).not.toMatch(/secrets\.|ssh-action|build-push-action|imagetools|workflow_run/);
        for (const job of Object.values(benchmark.jobs) as any[]) {
            expect(job['continue-on-error']).toBeUndefined();
            for (const step of job.steps) expect(step['continue-on-error']).toBeUndefined();
        }
        const download = benchmark.jobs['shard-coverage'].steps.find((step: any) => step.uses?.startsWith('actions/download-artifact'));
        expect(download.with.pattern).toBe('bench-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.sha }}-shard-*');
        expect(download.with['merge-multiple']).toBe(false);
        expect(download.with['run-id']).toBeUndefined();
        const finalDownloads = benchmark.jobs.test.steps.filter((step: any) => step.uses?.startsWith('actions/download-artifact'));
        expect(finalDownloads.map((step: any) => step.with.pattern || step.with.name)).toEqual([
            'bench-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.sha }}-single-*',
            'shard-coverage-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.sha }}',
        ]);
        expect(JSON.stringify(benchmark.jobs.test.steps)).not.toMatch(/npm ci|vitest run|benchmark\.mjs merge/);
    });

    it.each(['failure', 'skipped', 'cancelled', '', 'unknown'])('final gate rejects %j in either dependency', status => {
        const step = benchmark.jobs.test.steps[0];
        expect(step.env).toEqual({
            CANDIDATES_RESULT: '${{ needs.candidates.result }}',
            SHARD_COVERAGE_RESULT: '${{ needs.shard-coverage.result }}',
        });
        const runGate = (candidate: string, shards: string) => spawnSync('bash', ['-e', '-c', step.run], {
            env: { ...process.env, CANDIDATES_RESULT: candidate, SHARD_COVERAGE_RESULT: shards },
        }).status;
        expect(runGate(status, 'success')).not.toBe(0);
        expect(runGate('success', status)).not.toBe(0);
        expect(runGate('success', 'success')).toBe(0);
    });

    it('accepts only complete, disjoint, successful shard sets', () => {
        expect(() => validateReports(reports(), expected, ['a', 'b'])).not.toThrow();
        expect(() => validateReports(reports().slice(0, 1), expected, ['a', 'b'])).toThrow('exactly');
        expect(() => validateReports([reports()[0], reports()[0]], expected, ['a', 'b'])).toThrow('exactly');
        expect(() => validateReports([report('1/2', 'a'), report('2/2', 'a')], expected, ['a', 'b'])).toThrow('Duplicate');
        expect(() => validateReports(reports(), expected, ['a', 'b', 'c'])).toThrow('discovery');
    });

    it.each(['run', 'attempt', 'sha', 'fingerprint'])('rejects foreign %s', key => {
        const shards = reports();
        Object.assign(shards[0], { [key]: 'wrong' });
        expect(() => validateReports(shards, expected, ['a', 'b'])).toThrow('identity');
    });

    it.each([{ exitCode: 1 }, { reason: 'failed' }, { errors: 1 }, { coverageGenerated: false },
        { candidate: 'default' }])('rejects failed/incomplete collection %j', patch => {
        const shards = reports();
        Object.assign(shards[1], patch);
        expect(() => validateReports(shards, expected, ['a', 'b'])).toThrow('incomplete');
    });

    it('rejects missing/pending test results and changed test counts', () => {
        const shards = reports();
        shards[0].files[0].pending = 1;
        expect(() => validateReports(shards, expected, ['a', 'b'])).toThrow('pending');
        expect(() => reconcile({ files: [file('a')] }, [{ files: [file('b')] }])).toThrow('differ');
        expect(() => reconcile({ files: [file('a')] }, [{ files: [file('a')] }])).not.toThrow();
        expect(() => identity({ NODE_ENV: 'test' })).toThrow('identity');
        expect(identity({ NODE_ENV: 'test', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2', GITHUB_SHA: 'a'.repeat(40) }))
            .toMatchObject({ run: '123', attempt: '2', sha: 'a'.repeat(40) });
    });

    it('derives the explicit hypothesis from available CPU and memory, not a fixed runner size', () => {
        expect(explicitWorkers(2, 7 * 2 ** 30)).toBe(2);
        expect(explicitWorkers(8, 7 * 2 ** 30)).toBe(3);
        expect(explicitWorkers(32, 1 * 2 ** 30)).toBe(1);
        expect(hardware().cpuAvailable).toBeGreaterThan(0);
        expect(hardware()).not.toHaveProperty('env');
    });

    it('keeps failing child exit status and never logs command arguments', async () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            expect(await timed('failure', process.execPath, ['-e', 'process.exit(7)', 'sensitive-sentinel'])).toBe(7);
            expect(log.mock.calls.flat().join('')).not.toContain('sensitive-sentinel');
        } finally { log.mockRestore(); }
    });

    it('separates parallel wall time from total runner occupancy and cache transfers', () => {
        const start = '2026-01-01T00:00:00Z';
        const end = '2026-01-01T00:01:00Z';
        const job = { name: 'test', started_at: start, completed_at: end, steps: [] };
        expect(summarize([job, job], start)).toMatchObject({ wallSeconds: 60, runnerMinutes: 2 });
        expect(cacheTimings('#1 importing cache manifest from redacted\n#1 DONE 1.2s\n#9 exporting cache to registry\n#9 DONE 40.1s'))
            .toEqual([{ phase: 'cache-import', seconds: 1.2 }, { phase: 'cache-export', seconds: 40.1 }]);
    });

    it('reporter records lifecycle timings with explicit worker configuration', () => {
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const reporter = new TimingReporter();
            reporter.onInit({ config: { root: process.cwd(), pool: 'forks', maxWorkers: 3, isolate: true } });
            reporter.onTestModuleEnd();
            reporter.onCoverage({ source: {} });
            expect(log.mock.calls.flat().join('')).toContain('"maxWorkers":3');
            expect(log.mock.calls.flat().join('')).toContain('coverage-generation-tail');
        } finally { log.mockRestore(); }
    });
});

describe('installed Vitest blob/coverage integration', () => {
    it('merges complementary branches without executing tests again; low coverage, failed tests and malformed blobs fail', () => {
        mkdirSync('coverage', { recursive: true });
        const dir = mkdtempSync(resolve('coverage/ci-fixture-'));
        const cli = resolve('node_modules/vitest/vitest.mjs');
        const invoke = (args: string[]) => spawnSync(process.execPath, [cli, '--root', dir, ...args], {
            cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, CI: 'true' },
        });
        try {
            writeFileSync(`${dir}/core.js`, 'export function choose(value) { if (value) { return 1; } else { return 2; } }');
            for (const [index, value] of [[1, true], [2, false]] as const) {
                writeFileSync(`${dir}/${index}.test.js`, `import {test,expect} from 'vitest';
import {appendFileSync} from 'node:fs'; import {choose} from './core.js';
test('branch',()=>{appendFileSync(${JSON.stringify(`${dir}/executions`)},'x'); expect(choose(${value})).toBe(${index});});`);
            }
            const config = { test: { include: ['*.test.js'], coverage: { provider: 'v8', reporter: ['json-summary'] } } };
            writeFileSync(`${dir}/collect.mjs`, `export default ${JSON.stringify(config)}`);
            writeFileSync(`${dir}/gate.mjs`, `export default ${JSON.stringify({ test: { ...config.test,
                coverage: { ...config.test.coverage, thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 } } } })}`);
            for (const shard of [1, 2]) {
                const result = invoke(['run', '--config', `${dir}/collect.mjs`, '--coverage', `--shard=${shard}/2`,
                    '--reporter=blob', `--outputFile.blob=${dir}/blobs/${shard}.json`]);
                expect(result.status, result.stdout + result.stderr).toBe(0);
            }
            const mergeArgs = ['--config', `${dir}/gate.mjs`, '--coverage', `--mergeReports=${dir}/blobs`];
            const merged = invoke(mergeArgs);
            expect(merged.status, merged.stdout + merged.stderr).toBe(0);
            const summary = JSON.parse(readFileSync(`${dir}/coverage/coverage-summary.json`, 'utf8'));
            expect(summary.total.branches.pct).toBe(100);
            expect(readFileSync(`${dir}/executions`, 'utf8')).toBe('xx');
            // Raw Vitest accepts a subset; our manifest guard above must reject missing shards.
            rmSync(`${dir}/blobs/2.json`);
            const incomplete = invoke(mergeArgs);
            expect(incomplete.status).not.toBe(0);
            expect(incomplete.stderr + incomplete.stdout).toContain('threshold');
            writeFileSync(`${dir}/blobs/1.json`, 'not a blob');
            expect(invoke(mergeArgs).status).not.toBe(0);
            writeFileSync(`${dir}/1.test.js`, "import {test,expect} from 'vitest'; test('failure',()=>expect(1).toBe(2));");
            expect(invoke(['run', '--config', `${dir}/collect.mjs`, '1.test.js']).status).not.toBe(0);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
});
