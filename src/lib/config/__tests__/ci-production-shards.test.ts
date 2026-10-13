import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface Step { name?: string; run?: string; uses?: string; env?: Record<string, string>; with?: Record<string, unknown>; 'continue-on-error'?: boolean }
interface Job {
    name: string; needs?: string | string[]; if?: string; permissions?: Record<string, string>;
    strategy?: { 'fail-fast': boolean; matrix: { include: { shard: string; artifact: string }[] } };
    services?: Record<string, unknown>; steps: Step[];
}
const require = createRequire(import.meta.url);
const { load } = require('js-yaml') as { load(text: string): Workflow };
interface Workflow {
    concurrency?: { group: string; 'cancel-in-progress': boolean };
    jobs: Record<string, Job>;
}
const push = load(readFileSync('.github/workflows/ci.yml', 'utf8'));
const production = load(readFileSync('.github/workflows/production.yml', 'utf8'));
const namespace = 'test-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.sha }}';
const step = (job: Job, name: string) => job.steps.find(item => item.name === name)!;

describe('Push CI release gates', () => {
    it('owns both coverage shards and the stable merged threshold gate', () => {
        const shards = push.jobs['test-shards'];
        expect(shards.needs).toBe('classify');
        expect(shards.strategy).toEqual({
            'fail-fast': false,
            matrix: { include: [{ shard: '1/2', artifact: 'shard-1' }, { shard: '2/2', artifact: 'shard-2' }] },
        });
        expect(step(shards, 'Run test shard with coverage').run).toBe('node scripts/ci/benchmark.mjs run shards "$SHARD"');
        const merged = push.jobs.test;
        expect(merged.needs).toEqual(['classify', 'test-shards']);
        expect(step(merged, 'Run Tests with Coverage').run).toBe('node scripts/ci/benchmark.mjs merge coverage/ci-input');
        expect(merged.steps.map(item => item.name)).toContain('Validate Nginx configuration');
        const download = merged.steps.find(item => item.uses?.startsWith('actions/download-artifact'))!;
        expect(download.with).toMatchObject({ pattern: `${namespace}-shard-*`, 'merge-multiple': false });
    });
    it('owns both real PostgreSQL contracts and both immutable image builds', () => {
        expect(push.jobs['postgres-contract'].services?.postgres).toBeDefined();
        expect(push.jobs['assistant-contract'].services?.postgres).toBeDefined();
        const build = push.jobs['build-and-push'];
        expect(build.permissions).toEqual({ contents: 'read', packages: 'write' });
        expect(build.steps.filter(item => item.uses === 'docker/build-push-action@v7')).toHaveLength(2);
        expect(JSON.stringify(build)).toContain('${{ github.sha }}');
    });
    it('never cancels older full evidence when newer pushes arrive', () => {
        expect(push.concurrency).toEqual({
            group: 'ci-${{ github.event_name }}-${{ github.sha }}',
            'cancel-in-progress': false,
        });
    });
    it('publishes evidence only after every mandatory gate is a dependency', () => {
        expect(push.jobs.status.needs).toEqual([
            'classify', 'lint-typecheck', 'test-shards', 'test', 'postgres-contract', 'assistant-contract', 'build-and-push',
        ]);
        expect(step(push.jobs.status, 'Validate Push CI results').run).toBe('node scripts/ci/changes.mjs push-status');
        const upload = push.jobs.status.steps.find(item => item.uses?.startsWith('actions/upload-artifact'))!;
        expect(upload.with).toMatchObject({
            name: 'release-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.sha }}',
            'if-no-files-found': 'error', 'retention-days': 14,
        });
        expect(push.jobs.status.permissions).toEqual({ contents: 'read', actions: 'read' });
        expect(push.jobs.status.steps.find(item => item.name === 'Pipeline timing report')?.['continue-on-error']).toBe(true);
    });
    it('keeps every heavy gate out of Production Pipeline', () => {
        expect(Object.keys(production.jobs)).not.toEqual(expect.arrayContaining([
            'test-shards', 'test', 'lint', 'build-and-push', 'return-contract', 'assistant-contract',
        ]));
        expect(JSON.stringify(production)).not.toMatch(/npm ci|vitest|build-push-action|Run Tests with Coverage/);
    });
});
