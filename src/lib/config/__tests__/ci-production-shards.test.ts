import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface Step {
    name?: string;
    uses?: string;
    run?: string;
    env?: Record<string, string>;
    with?: Record<string, unknown>;
    'continue-on-error'?: boolean;
}
interface Job {
    name: string;
    needs?: string | string[];
    if?: string;
    steps: Step[];
    permissions?: Record<string, string>;
    strategy?: { 'fail-fast': boolean; matrix: { include: { shard: string; artifact: string }[] } };
    'continue-on-error'?: boolean;
}
const require = createRequire(import.meta.url);
const { load } = require('js-yaml') as { load(text: string): { jobs: Record<string, Job> } };
const { jobs } = load(readFileSync('.github/workflows/production.yml', 'utf8'));
const step = (job: Job, name: string) => {
    const value = job.steps.find(item => item.name === name);
    if (!value) throw new Error(`Missing step: ${name}`);
    return value;
};
const namespace = 'test-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.sha }}';

describe('production two-shard release gate', () => {
    it('uses two independent runners, unchanged default workers and full discovery', () => {
        const shards = jobs['test-shards'];
        expect(shards).toBeDefined();
        expect(shards.needs).toBe('agents-consistency');
        expect(shards.if).toBe("${{ needs.agents-consistency.outputs.full == 'true' }}");
        expect(shards.strategy).toEqual({
            'fail-fast': false,
            matrix: { include: [{ shard: '1/2', artifact: 'shard-1' }, { shard: '2/2', artifact: 'shard-2' }] },
        });
        expect(shards.permissions).toEqual({ contents: 'read' });
        expect(step(shards, 'Run test shard with coverage').run).toBe('node scripts/ci/benchmark.mjs run shards "$SHARD"');
        expect(step(shards, 'Run test shard with coverage').env).toEqual({ SHARD: '${{ matrix.shard }}' });
        expect(JSON.stringify(shards.steps)).not.toMatch(/--maxWorkers|--exclude|--no-isolate|--passWithNoTests/);
        const checkout = shards.steps.find(item => item.uses?.startsWith('actions/checkout'));
        expect(checkout?.with).toMatchObject({ ref: '${{ github.sha }}', 'persist-credentials': false });
        const upload = shards.steps.find(item => item.uses?.startsWith('actions/upload-artifact'));
        expect(upload?.with).toMatchObject({
            name: `${namespace}-${'${{ matrix.artifact }}'}`, 'if-no-files-found': 'error',
        });
        expect(upload?.with?.path).toContain('coverage/ci-benchmark/blob.json');
        expect(upload?.with?.path).toContain('coverage/ci-benchmark/result.json');
    });

    it('keeps the stable test job as a mandatory merged global coverage gate', () => {
        expect(jobs.test.name).toBe('Test & Validate');
        expect(jobs.test.needs).toEqual(['agents-consistency', 'test-shards']);
        expect(jobs.test.if).toBe("${{ always() && needs.agents-consistency.result == 'success' && needs.agents-consistency.outputs.full == 'true' }}");
        expect(step(jobs.test, 'Run Tests with Coverage').run).toBe('node scripts/ci/benchmark.mjs merge coverage/ci-input');
        expect(jobs.test.steps.map(item => item.name)).toContain('Validate Nginx configuration');
        const download = jobs.test.steps.find(item => item.uses?.startsWith('actions/download-artifact'));
        expect(download?.with).toEqual({ pattern: `${namespace}-shard-*`, path: 'coverage/ci-input', 'merge-multiple': false });
        const upload = jobs.test.steps.find(item => item.uses?.startsWith('actions/upload-artifact'));
        expect(upload?.with?.path).toContain('coverage/ci-merged/result.json');
        expect(upload?.with?.path).toContain('coverage/ci-merged/coverage/coverage-final.json');
    });

    it.each(['failure', 'skipped', 'cancelled', '', 'unknown', 'success'])('fails closed for shard result %j', result => {
        const guard = jobs.test.steps[0];
        expect(guard.name).toBe('Require both test shards');
        expect(guard.env).toEqual({ SHARDS_RESULT: '${{ needs.test-shards.result }}' });
        expect(guard.run).toBeDefined();
        const child = spawnSync('bash', ['-e', '-c', guard.run!], { env: { ...process.env, SHARDS_RESULT: result } });
        expect(child.status === 0).toBe(result === 'success');
    });

    it('uses the benchmark-proven artifact transport and only generated evidence paths', () => {
        const shards = jobs['test-shards'];
        const shardUpload = shards.steps.find(item => item.uses?.startsWith('actions/upload-artifact'));
        expect(shardUpload?.with?.path).toBe('coverage/ci-benchmark/blob.json\ncoverage/ci-benchmark/result.json\ncoverage/ci-benchmark/metrics.jsonl\n');
        const mergedUpload = jobs.test.steps.find(item => item.uses?.startsWith('actions/upload-artifact'));
        expect(mergedUpload?.with?.path).toBe('coverage/ci-merged/result.json\ncoverage/ci-merged/metrics.jsonl\ncoverage/ci-merged/coverage/coverage-final.json\n');
        for (const item of [...shards.steps, ...jobs.test.steps].filter(item => /actions\/(upload|download)-artifact/.test(item.uses || ''))) {
            expect(item.uses).toMatch(/@v4$/);
        }
    });

    it('preserves every release gate and includes shard occupancy in timing', () => {
        expect(jobs.deploy.needs).toEqual(['test', 'lint', 'build-and-push', 'return-contract']);
        expect(jobs.deploy.if).toBe("${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}");
        expect(jobs.timing.needs).toContain('test-shards');
        for (const name of ['test-shards', 'test', 'lint', 'build-and-push', 'return-contract']) {
            expect(jobs[name]['continue-on-error']).toBeUndefined();
            for (const item of jobs[name].steps) expect(item['continue-on-error']).toBeUndefined();
        }
    });
});
