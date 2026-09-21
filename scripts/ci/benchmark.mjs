import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { emit, explicitWorkers, fingerprint, hardware, timed } from './metrics.mjs';

const vitest = resolve('node_modules/vitest/vitest.mjs');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
export const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');

export function identity(env = process.env) {
    if (!/^\d+$/.test(env.GITHUB_RUN_ID || '') || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT || '') ||
        !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')) throw new Error('Missing run/attempt/SHA identity');
    return { run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, sha: env.GITHUB_SHA,
        fingerprint: fingerprint() };
}

export function validateReports(reports, expected, discovery) {
    if (reports.length !== 2 || reports.map(r => r.shard).sort().join(',') !== '1/2,2/2') {
        throw new Error('Expected exactly shards 1/2 and 2/2');
    }
    const files = [];
    for (const report of reports) {
        for (const key of ['run', 'attempt', 'sha', 'fingerprint']) {
            if (report[key] !== expected[key]) throw new Error(`Shard identity mismatch: ${key}`);
        }
        if (report.candidate !== 'shards' || report.exitCode !== 0 || report.reason !== 'passed' ||
            report.errors !== 0 || !report.coverageGenerated) throw new Error('Failed/incomplete shard');
        if (report.files.some(file => file.failed || file.pending)) throw new Error('Failed/pending tests');
        files.push(...report.files.map(file => file.file));
    }
    if (new Set(files).size !== files.length) throw new Error('Duplicate tests across shards');
    if (JSON.stringify([...files].sort()) !== JSON.stringify([...discovery].sort())) {
        throw new Error('Shard discovery differs from complete suite');
    }
}

export function reconcile(baseline, candidates) {
    const normalized = report => JSON.stringify(report.files.slice().sort((a, b) => a.file.localeCompare(b.file)));
    if (candidates.some(report => normalized(report) !== normalized(baseline))) {
        throw new Error('Candidate test files/counts/results differ from default');
    }
}

async function discovery(directory) {
    const file = `${directory}/discovery.json`;
    const code = await timed('test-discovery', process.execPath, [vitest, 'list', '--filesOnly', `--json=${file}`]);
    if (code !== 0) throw new Error('Discovery failed');
    const files = readJson(file).map(item => relative(process.cwd(), item.file));
    if (!files.length) throw new Error('Empty suite');
    return files;
}

async function run(candidate, shard) {
    if (!['default', 'explicit', 'shards'].includes(candidate)) throw new Error('Unknown candidate');
    if (candidate === 'shards' && !['1/2', '2/2'].includes(shard)) throw new Error('Invalid shard');
    const directory = resolve('coverage/ci-benchmark');
    mkdirSync(directory, { recursive: true });
    process.env.CI_METRICS_FILE = `${directory}/metrics.jsonl`;
    const expected = identity();
    if (execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== expected.sha) {
        throw new Error('Checkout SHA differs from workflow');
    }
    const runner = hardware();
    emit({ kind: 'hardware', ...runner });
    const files = await discovery(directory);
    const manifest = `${directory}/manifest.json`;
    const args = [vitest, 'run', '--coverage', '--reporter=default',
        '--reporter=./scripts/ci/timing-reporter.mjs', `--coverage.reportsDirectory=${directory}/coverage`];
    if (candidate === 'explicit') args.push(`--maxWorkers=${explicitWorkers(runner.cpuAvailable, runner.memoryLimitBytes)}`);
    if (candidate === 'shards') args.push('--config=scripts/ci/vitest-shard.config.mjs',
        `--shard=${shard}`, '--reporter=blob', `--outputFile.blob=${directory}/blob.json`);
    const exitCode = await timed('test-and-coverage', process.execPath, args, {
        env: { ...process.env, CI_TEST_MANIFEST: manifest, CI_BENCHMARK_SHARD: shard || '' },
    });
    // A crash or incomplete reporter is a failure, not an empty success artifact.
    const report = readJson(manifest);
    if (candidate !== 'shards' && JSON.stringify(report.files.map(f => f.file).sort()) !== JSON.stringify(files.sort())) {
        throw new Error('Full-suite discovery mismatch');
    }
    writeFileSync(`${directory}/result.json`, JSON.stringify({ ...expected, ...report,
        candidate, shard: shard || null, runner, exitCode,
        blobHash: candidate === 'shards' ? digest(`${directory}/blob.json`) : null }));
    process.exitCode = exitCode;
}

function readBundles(input) {
    return readdirSync(input).map(name => ({
        dir: `${input}/${name}`, report: readJson(`${input}/${name}/result.json`),
    }));
}

export function validateComparison(singles, combined, expected, strategy = 'all') {
    if (!['all', 'shards'].includes(strategy)) throw new Error('Unknown benchmark strategy');
    const required = strategy === 'shards' ? ['default'] : ['default', 'explicit'];
    if (singles.length !== required.length || singles.map(r => r.candidate).sort().join(',') !== required.join(',')) {
        throw new Error(`Missing or unexpected comparator for ${strategy}`);
    }
    for (const report of [...singles, combined]) {
        for (const key of ['run', 'attempt', 'sha', 'fingerprint']) {
            if (report[key] !== expected[key]) throw new Error(`Comparison identity mismatch: ${key}`);
        }
        if (report.exitCode !== 0 || report.reason !== 'passed' || report.errors !== 0 ||
            !report.files.length || report.files.some(file => file.failed || file.pending)) {
            throw new Error('Failed/incomplete comparison result');
        }
    }
    if (singles.some(report => !report.coverageGenerated) || combined.candidate !== 'shards' ||
        combined.globalCoveragePassed !== true) throw new Error('Missing complete coverage gate');
    reconcile(singles[0], [...singles.slice(1), combined]);
}

export async function merge(input) {
    const directory = resolve('coverage/ci-merged');
    mkdirSync(`${directory}/blobs`, { recursive: true });
    process.env.CI_METRICS_FILE = `${directory}/metrics.jsonl`;
    const expected = identity();
    // Input contains ONLY the two shard artifacts; comparators are a separate gate.
    const reports = readBundles(input);
    const files = await discovery(directory);
    validateReports(reports.map(bundle => bundle.report), expected, files);
    for (const { dir, report } of reports) {
        if (digest(`${dir}/blob.json`) !== report.blobHash) throw new Error('Blob checksum mismatch');
        copyFileSync(`${dir}/blob.json`, `${directory}/blobs/${report.shard[0]}.json`);
    }
    // No test execution: Vitest replays blobs and merges Istanbul maps with global thresholds.
    const code = await timed('merge-and-global-coverage', process.execPath, [vitest,
        `--mergeReports=${directory}/blobs`, '--coverage', '--config=vitest.config.ts',
        '--reporter=default', '--reporter=./scripts/ci/timing-reporter.mjs',
        `--coverage.reportsDirectory=${directory}/coverage`], {
        env: { ...process.env, CI_TEST_MANIFEST: `${directory}/manifest.json` },
    });
    if (code !== 0) { process.exitCode = code; return; }
    const combined = readJson(`${directory}/manifest.json`);
    const collected = { files: reports.flatMap(bundle => bundle.report.files) };
    reconcile(collected, [combined]);
    // onCoverage is not replayed by Vitest merge. Attest global coverage only AFTER
    // the merge process has exited successfully (including original thresholds).
    writeFileSync(`${directory}/result.json`, JSON.stringify({ ...expected, ...combined,
        candidate: 'shards', globalCoveragePassed: true, exitCode: code }));
    emit({ kind: 'shard-coverage-gate', result: 'passed', fileCount: files.length });
}

function compare(input, merged, strategy = 'all') {
    const singles = readBundles(input).map(bundle => bundle.report);
    const combined = readJson(merged);
    validateComparison(singles, combined, identity(), strategy);
    emit({ kind: 'benchmark-gate', result: 'passed', fileCount: combined.files.length });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [mode, ...args] = process.argv.slice(2);
    if (mode === 'run') await run(...args);
    else if (mode === 'merge') await merge(...args);
    else if (mode === 'compare') compare(...args);
    else throw new Error('Usage: benchmark.mjs run <default|explicit|shards> [1/2|2/2] | merge <shard-artifacts> | compare <candidate-artifacts> <merged-result> [all|shards]');
}
