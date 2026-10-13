import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface Step { id?: string; name?: string; run?: string; uses?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown>; 'continue-on-error'?: boolean }
interface Job { name: string; needs?: string | string[]; if?: string; steps: Step[]; permissions?: Record<string, string>; outputs?: Record<string, string> }
const require = createRequire(import.meta.url);
const { load } = require('js-yaml') as { load(text: string): { on: Record<string, unknown>; permissions: Record<string, string>; jobs: Record<string, Job> } };
const production = load(readFileSync('.github/workflows/production.yml', 'utf8'));
const { on, jobs } = production;

describe('deploy-only Production Pipeline', () => {
    it('keeps schedule/manual triggers and least-privilege defaults', () => {
        expect(on).toEqual({ schedule: [{ cron: '17 14 * * 1-5' }], workflow_dispatch: null });
        expect(production.permissions).toEqual({ contents: 'read', actions: 'read' });
        expect(jobs['release-please'].permissions).toEqual({ contents: 'write', 'pull-requests': 'write' });
    });
    it('contains only light guard, artifact verification, deploy, release automation and status', () => {
        expect(Object.keys(jobs)).toEqual([
            'release-please', 'agents-consistency', 'release-readiness', 'release-artifact', 'deploy', 'status',
        ]);
        const text = JSON.stringify(production);
        expect(text).not.toMatch(/npm ci|vitest|Run Tests with Coverage|build-push-action|setup-buildx|services/);
        expect(jobs['release-readiness'].needs).toBe('agents-consistency');
        expect(jobs['release-artifact'].needs).toBe('release-readiness');
        expect(jobs.deploy.needs).toBe('release-artifact');
    });
    it('downloads exact run/attempt/SHA manifest with actions read permission', () => {
        const job = jobs['release-artifact'];
        expect(job.permissions).toEqual({ contents: 'read', actions: 'read' });
        const download = job.steps.find(step => step.uses?.startsWith('actions/download-artifact'))!;
        expect(download.with).toMatchObject({
            name: 'release-${{ needs.release-readiness.outputs.run-id }}-${{ needs.release-readiness.outputs.run-attempt }}-${{ needs.release-readiness.outputs.release-sha }}',
            'run-id': '${{ needs.release-readiness.outputs.run-id }}',
            repository: '${{ github.repository }}',
        });
        expect(job.steps.find(step => step.id === 'manifest')?.run)
            .toBe('node scripts/ci/release-artifact.cjs verify release-evidence/manifest.json');
    });
    it('keeps Release Please independent and final status fail-closed', () => {
        expect(jobs['release-please'].needs).toBe('agents-consistency');
        expect(jobs['release-please'].if).toBe("${{ needs.agents-consistency.outputs.full == 'true' && github.event_name == 'schedule' }}");
        expect(jobs.status.needs).toEqual([
            'agents-consistency', 'release-readiness', 'release-artifact', 'deploy', 'release-please',
        ]);
        expect(jobs.status.if).toBe('${{ always() }}');
        const command = jobs.status.steps.find(step => step.name === 'Validasi hasil jalur CI')!.run!;
        for (const eventName of ['schedule', 'workflow_dispatch']) {
            const needs: Record<string, { result: string; outputs?: { full: string } }> = {
                'agents-consistency': { result: 'success', outputs: { full: 'true' } },
                'release-readiness': { result: 'success' }, 'release-artifact': { result: 'success' },
                deploy: { result: 'success' },
                'release-please': { result: eventName === 'schedule' ? 'success' : 'skipped' },
            };
            for (const fail of [false, true]) {
                needs['release-artifact'].result = fail ? 'failure' : 'success';
                const child = spawnSync('bash', ['-e', '-c', command], { encoding: 'utf8', timeout: 10_000,
                    env: { ...process.env, CI_NEEDS: JSON.stringify(needs), GITHUB_EVENT_NAME: eventName } });
                expect(child.status, child.stdout + child.stderr).toBe(fail ? 1 : 0);
            }
        }
    });
});
