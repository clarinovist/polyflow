import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface Step { id?: string; name?: string; run?: string; uses?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown> }
interface Job { name: string; needs?: string | string[]; if?: string; steps: Step[]; permissions?: Record<string, string>; outputs?: Record<string, string> }
const require = createRequire(import.meta.url);
const { load } = require('js-yaml') as { load(text: string): { on: Record<string, unknown>; jobs: Record<string, Job> } };
const { on, jobs } = load(readFileSync('.github/workflows/production.yml', 'utf8'));
const heavy = ['test-shards', 'test', 'lint', 'build-and-push', 'return-contract'];

describe('wiring CI selektif tanpa bypass rilis', () => {
    it('pemicu tidak melewati seluruh workflow atau menyediakan mode dokumen paksa', () => {
        expect(on).toEqual({ push: { branches: ['main'] }, workflow_dispatch: null });
    });
    it('palang lama selalu aktif, sekarang gate awal read-only tanpa install aplikasi', () => {
        const initial = jobs['agents-consistency'];
        expect(initial.name).toBe('AGENTS.md Consistency');
        expect(initial.needs).toBeUndefined(); expect(initial.if).toBeUndefined();
        expect(initial.permissions).toEqual({ contents: 'read' });
        expect(initial.outputs).toEqual({ full: '${{ steps.changes.outputs.full }}' });
        expect(initial.steps[0].with).toEqual({ ref: '${{ github.sha }}', 'fetch-depth': 0, 'persist-credentials': false });
        expect(initial.steps.map(step => step.run).filter(Boolean)).toEqual([
            'bash scripts/check-agents-consistency.sh', 'bash scripts/check-node-version.sh', 'node scripts/ci/changes.mjs',
        ]);
        expect(initial.steps.find(step => step.id === 'changes')?.run).toBe('node scripts/ci/changes.mjs');
        expect(JSON.stringify(initial)).not.toMatch(/npm ci|npx|secrets\.|continue-on-error|services/);
        expect(initial.steps.find(step => step.uses?.startsWith('actions/setup-node'))?.with).toEqual({ 'node-version-file': '.nvmrc' });
    });
    it('heavy jobs paralel hanya setelah palang sukses dan full=true', () => {
        for (const name of heavy.filter(name => name !== 'test')) {
            expect(jobs[name].needs).toBe('agents-consistency');
            expect(jobs[name].if).toBe("${{ needs.agents-consistency.outputs.full == 'true' }}");
        }
        expect(jobs.test.needs).toEqual(['agents-consistency', 'test-shards']);
        expect(jobs.test.if).toBe("${{ always() && needs.agents-consistency.result == 'success' && needs.agents-consistency.outputs.full == 'true' }}");
        expect(jobs.test.steps[0].run).toContain('"$SHARDS_RESULT" != "success"');
    });
    it('semua gate dan release identity tetap wajib; manual tidak mutasi release/deploy', () => {
        expect(jobs.deploy.needs).toEqual(['test', 'lint', 'build-and-push', 'return-contract']);
        expect(jobs.deploy.if).toBe("${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}");
        expect(jobs['release-please'].needs).toBe('agents-consistency');
        expect(jobs['release-please'].if).toBe("${{ needs.agents-consistency.outputs.full == 'true' && github.event_name == 'push' }}");
        expect(JSON.stringify(jobs.deploy)).toContain('release-guard.cjs');
        expect(JSON.stringify(jobs.deploy)).toContain('needs.build-and-push.outputs.digest');
        expect(JSON.stringify(jobs)).not.toContain('continue-on-error');
    });
    it('status akhir selalu mengevaluasi seluruh gate tanpa npm install atau secrets', () => {
        const status = jobs.status;
        expect(status.name).toBe('Status CI'); expect(status.if).toBe('${{ always() }}');
        expect(status.needs).toEqual(['agents-consistency', ...heavy, 'deploy', 'release-please']);
        expect(status.permissions).toEqual({ contents: 'read' });
        expect(status.steps[0].with).toEqual({ ref: '${{ github.sha }}', 'persist-credentials': false });
        const step = status.steps.find(step => step.name === 'Validasi hasil jalur CI')!;
        expect(step.env).toEqual({ CI_NEEDS: '${{ toJSON(needs) }}' });
        expect(step.run).toBe('node scripts/ci/changes.mjs status');
        expect(JSON.stringify(status)).not.toMatch(/npm ci|npx|secrets\./);
        expect(jobs.timing.if).toBe("${{ always() && needs.agents-consistency.outputs.full == 'true' }}");
        expect(jobs.timing.needs).toContain('agents-consistency');
    });
    it.each(['true', 'false'])('menjalankan shell status aktual untuk full=%s', full => {
        const needs: Record<string, { result: string; outputs?: { full: string } }> = {
            'agents-consistency': { result: 'success', outputs: { full } },
            ...Object.fromEntries([...heavy, 'deploy', 'release-please'].map(name => [name, { result: full === 'true' ? 'success' : 'skipped' }])),
        };
        const command = jobs.status.steps.find(step => step.name === 'Validasi hasil jalur CI')!.run!;
        for (const fail of [false, true]) {
            if (fail) needs.lint.result = 'failure';
            const child = spawnSync('bash', ['-e', '-c', command], { encoding: 'utf8', timeout: 10_000,
                env: { ...process.env, CI_NEEDS: JSON.stringify(needs), GITHUB_EVENT_NAME: 'push' } });
            expect(child.status, child.stdout + child.stderr).toBe(fail ? 1 : 0);
        }
    });
});
