import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    files: new Map<string, string>(),
    entries: ['shard-1', 'shard-2'],
    timed: vi.fn(),
    emit: vi.fn(),
}));
vi.mock('node:fs', () => ({
    mkdirSync: vi.fn(),
    readFileSync: (file: string) => {
        if (!mocks.files.has(file)) throw new Error(`Missing file: ${file}`);
        return mocks.files.get(file);
    },
    readdirSync: () => mocks.entries,
    copyFileSync: (from: string, to: string) => mocks.files.set(to, mocks.files.get(from)!),
    writeFileSync: (file: string, data: string) => mocks.files.set(file, data),
}));
vi.mock('../../../../scripts/ci/metrics.mjs', () => ({
    fingerprint: () => 'lock', timed: mocks.timed, emit: mocks.emit,
    explicitWorkers: vi.fn(), hardware: vi.fn(),
}));

import { merge } from '../../../../scripts/ci/benchmark.mjs';

const directory = resolve('coverage/ci-merged');
const expected = { run: '123', attempt: '1', sha: 'a'.repeat(40), fingerprint: 'lock' };
const file = (name: string) => ({ file: name, passed: 1, failed: 0, skipped: 0, pending: 0 });
const paths = ['src/__tests__/a.test.ts', 'src/__tests__/b.test.ts'];
const combined = { reason: 'passed', errors: 0, coverageGenerated: false, files: paths.map(file) };
const originalExitCode = process.exitCode;

beforeEach(() => {
    mocks.files.clear();
    mocks.entries = ['shard-1', 'shard-2'];
    mocks.emit.mockClear();
    vi.stubEnv('GITHUB_RUN_ID', expected.run);
    vi.stubEnv('GITHUB_RUN_ATTEMPT', expected.attempt);
    vi.stubEnv('GITHUB_SHA', expected.sha);
    vi.stubEnv('CI_METRICS_FILE', '');
    for (const [index, path] of paths.entries()) {
        const blob = `blob-${index}`;
        mocks.files.set(`input/shard-${index + 1}/blob.json`, blob);
        mocks.files.set(`input/shard-${index + 1}/result.json`, JSON.stringify({
            ...expected, reason: 'passed', errors: 0, coverageGenerated: true,
            exitCode: 0, candidate: 'shards', shard: `${index + 1}/2`, files: [file(path)],
            blobHash: createHash('sha256').update(blob).digest('hex'),
        }));
    }
    mocks.timed.mockReset().mockImplementation(async (label: string) => {
        if (label === 'test-discovery') {
            mocks.files.set(`${directory}/discovery.json`, JSON.stringify(paths.map(path => ({ file: resolve(path) }))));
        } else {
            mocks.files.set(`${directory}/manifest.json`, JSON.stringify(combined));
        }
        return 0;
    });
});
afterEach(() => {
    vi.unstubAllEnvs();
    process.exitCode = originalExitCode;
});

describe('independent shard merge orchestration', () => {
    it('merges once without any comparator artifact and attests coverage after success', async () => {
        await merge('input');
        const result = JSON.parse(mocks.files.get(`${directory}/result.json`)!);
        expect(result).toMatchObject({ ...expected, candidate: 'shards', globalCoveragePassed: true, exitCode: 0 });
        const mergeCalls = mocks.timed.mock.calls.filter(call => call[0] === 'merge-and-global-coverage');
        expect(mergeCalls).toHaveLength(1);
        expect(mergeCalls[0][2]).toContain(`--mergeReports=${directory}/blobs`);
        expect(mergeCalls[0][2]).toContain('--config=vitest.config.ts');
        expect(mergeCalls[0][2]).toContain('--coverage');
        expect(mergeCalls[0][2]).not.toContain('run');
        expect(mocks.emit).toHaveBeenCalledWith({ kind: 'shard-coverage-gate', result: 'passed', fileCount: 2 });
    });

    it('rejects a missing shard before invoking merge', async () => {
        mocks.entries = ['shard-1'];
        await expect(merge('input')).rejects.toThrow('exactly');
        expect(mocks.timed).toHaveBeenCalledTimes(1); // discovery only
    });

    it('rejects corrupted blob checksum before invoking merge', async () => {
        mocks.files.set('input/shard-2/blob.json', 'corrupt');
        await expect(merge('input')).rejects.toThrow('checksum');
        expect(mocks.timed).toHaveBeenCalledTimes(1);
    });

    it('does not publish success when Vitest merge or global coverage returns nonzero', async () => {
        mocks.timed.mockImplementationOnce(async () => {
            mocks.files.set(`${directory}/discovery.json`, JSON.stringify(paths.map(path => ({ file: resolve(path) }))));
            return 0;
        }).mockResolvedValueOnce(1);
        await merge('input');
        expect(process.exitCode).toBe(1);
        expect(mocks.files.has(`${directory}/result.json`)).toBe(false);
        expect(mocks.emit).not.toHaveBeenCalled();
    });

    it('rejects incomplete replay instead of publishing a successful shard result', async () => {
        mocks.timed.mockImplementationOnce(async () => {
            mocks.files.set(`${directory}/discovery.json`, JSON.stringify(paths.map(path => ({ file: resolve(path) }))));
            return 0;
        }).mockImplementationOnce(async () => {
            mocks.files.set(`${directory}/manifest.json`, JSON.stringify({ ...combined, files: [file(paths[0])] }));
            return 0;
        });
        await expect(merge('input')).rejects.toThrow('differ');
        expect(mocks.files.has(`${directory}/result.json`)).toBe(false);
    });
});
