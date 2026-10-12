import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const readiness = require('../../../../scripts/ci/release-readiness.cjs') as {
    check(input: Record<string, unknown>): Promise<void>;
    latestExactRun(response: unknown, sha: string): { id: number; status: string; conclusion?: string } | undefined;
};
const { load } = require('js-yaml') as { load(text: string): Workflow };
interface Step { id?: string; name?: string; run?: string; uses?: string; if?: string; with?: Record<string, string> }
interface Workflow {
    concurrency?: { group: string; 'cancel-in-progress': boolean };
    jobs: Record<string, Job>;
}
interface Job {
    needs?: string | string[];
    if?: string;
    permissions?: Record<string, string>;
    outputs?: Record<string, string>;
    services?: Record<string, unknown>;
    env?: Record<string, string>;
    steps: Step[];
}
const push = load(readFileSync('.github/workflows/ci.yml', 'utf8'));
const production = load(readFileSync('.github/workflows/production.yml', 'utf8'));
const sha = 'a'.repeat(40);
const run = (patch: Record<string, unknown> = {}) => ({
    id: 123,
    head_sha: sha,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    ...patch,
});
const dependencies = (runs: Record<string, unknown>[]) => ({
    github: { rest: { actions: { listWorkflowRuns: vi.fn().mockResolvedValue({ data: { workflow_runs: runs } }) } } },
    context: { sha, ref: 'refs/heads/main', repo: { owner: 'fixture', repo: 'app' } },
    core: { setOutput: vi.fn(), notice: vi.fn(), info: vi.fn() },
    sleep: vi.fn().mockResolvedValue(undefined),
    attempts: 2,
    intervalMs: 0,
});

describe('exact-SHA Push CI readiness', () => {
    it('accepts only a completed successful push run for exact main SHA', async () => {
        const input = dependencies([run(), run({ id: 999, head_sha: 'b'.repeat(40) })]);
        await readiness.check(input);
        expect(input.github.rest.actions.listWorkflowRuns).toHaveBeenCalledWith({
            owner: 'fixture', repo: 'app', workflow_id: 'ci.yml', branch: 'main', event: 'push', head_sha: sha, per_page: 20,
        });
        expect(input.core.setOutput).toHaveBeenCalledWith('run-id', '123');
    });

    it.each(['failure', 'cancelled', 'timed_out', 'skipped', 'neutral'])('rejects completed %s Push CI', async conclusion => {
        await expect(readiness.check(dependencies([run({ conclusion })]))).rejects.toThrow('did not succeed');
    });

    it('waits for an active run and then accepts success', async () => {
        const input = dependencies([run({ status: 'in_progress', conclusion: null })]);
        input.github.rest.actions.listWorkflowRuns
            .mockResolvedValueOnce({ data: { workflow_runs: [run({ status: 'in_progress', conclusion: null })] } })
            .mockResolvedValueOnce({ data: { workflow_runs: [run()] } });
        await readiness.check(input);
        expect(input.sleep).toHaveBeenCalledOnce();
    });

    it('fails closed on missing, malformed, foreign, or unknown run state', async () => {
        await expect(readiness.check(dependencies([]))).rejects.toThrow('deadline');
        await expect(readiness.check(dependencies([run({ status: 'mystery' })]))).rejects.toThrow('unknown');
        await expect(readiness.check(dependencies([run({ event: 'workflow_dispatch' })]))).rejects.toThrow('deadline');
        await expect(readiness.check(dependencies([run({ head_branch: 'other' })]))).rejects.toThrow('deadline');
        const malformed = dependencies([]);
        malformed.github.rest.actions.listWorkflowRuns.mockResolvedValue({ data: {} });
        await expect(readiness.check(malformed)).rejects.toThrow('incomplete');
    });

    it('rejects non-main or malformed release identity before API calls', async () => {
        const input = dependencies([run()]);
        await expect(readiness.check({ ...input, context: { ...input.context, ref: 'refs/heads/other' } }))
            .rejects.toThrow('identity');
        await expect(readiness.check({ ...input, context: { ...input.context, sha: 'main' } }))
            .rejects.toThrow('identity');
        expect(input.github.rest.actions.listWorkflowRuns).not.toHaveBeenCalled();
    });

    it('wires all production release work behind the readiness gate', () => {
        const gate = production.jobs['release-readiness'];
        expect(gate.needs).toBe('agents-consistency');
        expect(gate.permissions).toEqual({ contents: 'read', actions: 'read' });
        expect(gate.outputs).toEqual({
            full: '${{ needs.agents-consistency.outputs.full }}',
            'push-run-id': '${{ steps.readiness.outputs.run-id }}',
        });
        expect(gate.steps.find(step => step.id === 'readiness')?.with?.script).toContain('release-readiness.cjs');
        for (const name of ['lint', 'test-shards', 'return-contract', 'assistant-contract', 'build-and-push']) {
            expect(production.jobs[name].needs).toBe('release-readiness');
        }
        expect(production.jobs.test.needs).toEqual(['release-readiness', 'test-shards']);
        expect(production.jobs['release-please'].needs).toBe('agents-consistency');
        expect(production.jobs.status.needs).toContain('release-readiness');
    });
});

describe('shared Push CI PostgreSQL contract', () => {
    it('runs the same fail-closed script in push and production with disposable Postgres', () => {
        const pushJob = push.jobs['postgres-contract'];
        const releaseJob = production.jobs['return-contract'];
        expect(push.jobs.classify).toBeDefined();
        expect(push.jobs['lint-typecheck']).toBeDefined();
        expect(push.jobs.test).toBeDefined();
        expect(Object.keys(push.jobs)).toEqual(['classify', 'lint-typecheck', 'test', 'postgres-contract', 'status']);
        expect(push.concurrency).toEqual({
            group: 'ci-${{ github.event_name }}-${{ github.ref }}',
            'cancel-in-progress': true,
        });
        expect(push.jobs.status.needs).toEqual(['classify', 'lint-typecheck', 'test', 'postgres-contract']);
        expect(push.jobs.status.if).toBe('${{ always() }}');
        expect(push.jobs.status.steps.find(step => step.name === 'Validate Push CI results')?.run)
            .toBe('node scripts/ci/changes.mjs push-status');
        expect(pushJob.needs).toBe('classify');
        expect(pushJob.if).toBe("${{ needs.classify.result == 'success' && needs.classify.outputs.full == 'true' }}");
        expect(pushJob.services?.postgres).toBeDefined();
        expect(releaseJob.services?.postgres).toBeDefined();
        expect(pushJob.env).toEqual(releaseJob.env);
        for (const job of [pushJob, releaseJob]) {
            expect(job.steps.find(step => step.name === 'Run release PostgreSQL contracts')?.run)
                .toBe('bash scripts/ci/run-postgres-contracts.sh');
            expect(JSON.stringify(job)).not.toContain('continue-on-error');
        }
        const script = readFileSync('scripts/ci/run-postgres-contracts.sh', 'utf8');
        expect(script).toContain('set -euo pipefail');
        expect(script).toContain('setup-return-test-db.mjs');
        expect(script).toContain('setup-central-identity-test-dbs.mjs');
        expect(script).toContain('cogs-economic-diagnosis-postgres.test.ts');
    });
});
