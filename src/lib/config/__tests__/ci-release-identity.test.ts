import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
interface Step { id?: string; name?: string; uses?: string; if?: string; env?: Record<string, string>; with?: Record<string, string> }
interface Job { steps: Step[]; needs?: string | string[]; outputs?: Record<string, string>; concurrency?: { group: string; 'cancel-in-progress': boolean } }
const { load } = require('js-yaml') as { load(text: string): { jobs: Record<string, Job> } };
const { jobs } = load(readFileSync('.github/workflows/production.yml', 'utf8'));
const sha = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;
const dependencies = () => ({
    github: { rest: { repos: { getCommit: vi.fn().mockResolvedValue({ data: { sha } }) } } },
    context: { sha: 'c'.repeat(40), ref: 'refs/heads/main', repo: { owner: 'fixture', repo: 'app' } },
    core: { setOutput: vi.fn(), notice: vi.fn() }, digest, workerDigest: digest, currentSha: sha,
});
const check = (input: ReturnType<typeof dependencies>) => {
    const guard = require('../../../../scripts/ci/release-guard.cjs') as { check(value: typeof input): Promise<void> };
    return guard.check(input);
};

describe('release identity guard', () => {
    it('allows an ancestor artifact only while workflow-start main is still current', async () => {
        const input = dependencies();
        await check(input);
        expect(input.github.rest.repos.getCommit).toHaveBeenCalledWith({ owner: 'fixture', repo: 'app', ref: 'main' });
        expect(input.core.setOutput).toHaveBeenCalledWith('current', 'true');
    });
    it('skips every mutation after main is superseded', async () => {
        const input = dependencies();
        input.github.rest.repos.getCommit.mockResolvedValue({ data: { sha: 'd'.repeat(40) } });
        await check(input);
        expect(input.core.setOutput).toHaveBeenCalledWith('current', 'false');
    });
    it('propagates API errors and rejects malformed artifact/current identities', async () => {
        const api = dependencies(); api.github.rest.repos.getCommit.mockRejectedValue(new Error('unavailable'));
        await expect(check(api)).rejects.toThrow('unavailable');
        for (const patch of [
            { digest: 'latest' }, { workerDigest: 'latest' }, { currentSha: 'main' },
            { context: { ...dependencies().context, sha: 'bad' } },
            { context: { ...dependencies().context, ref: 'refs/heads/other' } },
        ]) await expect(check({ ...dependencies(), ...patch } as ReturnType<typeof dependencies>)).rejects.toThrow('identity');
    });
});

describe('deploy-only immutable wiring', () => {
    it('serializes deployment and consumes only verified artifact outputs', () => {
        expect(jobs.deploy.needs).toBe('release-artifact');
        expect(jobs.deploy.concurrency).toEqual({ group: 'production-deploy', 'cancel-in-progress': false });
        expect(jobs['release-artifact'].outputs).toEqual({
            'release-sha': '${{ steps.manifest.outputs.release-sha }}',
            digest: '${{ steps.manifest.outputs.digest }}',
            'worker-digest': '${{ steps.manifest.outputs.worker-digest }}',
        });
        const guard = jobs.deploy.steps.find(item => item.id === 'revision')!;
        expect(guard.env).toMatchObject({
            RELEASE_SHA: '${{ needs.release-artifact.outputs.release-sha }}',
            IMAGE_DIGEST: '${{ needs.release-artifact.outputs.digest }}',
            WORKER_IMAGE_DIGEST: '${{ needs.release-artifact.outputs.worker-digest }}',
        });
        expect(guard.with?.script).toContain('currentSha: context.sha');
    });
    it('guards every mutation and binds runtime checkout/images to manifest evidence', () => {
        const guardIndex = jobs.deploy.steps.findIndex(item => item.id === 'revision');
        for (const name of ['Log in to Container Registry', 'Promote tested images to :latest', 'Deploy via SSH']) {
            const index = jobs.deploy.steps.findIndex(item => item.name === name);
            expect(index).toBeGreaterThan(guardIndex);
            expect(jobs.deploy.steps[index].if).toBe("steps.revision.outputs.current == 'true'");
        }
        const remote = jobs.deploy.steps.find(item => item.name === 'Deploy via SSH')!;
        expect(remote.env).toMatchObject({
            DEPLOY_SHA: '${{ needs.release-artifact.outputs.release-sha }}',
            DEPLOY_IMAGE: '${{ env.REGISTRY }}/${{ env.REPO }}@${{ needs.release-artifact.outputs.digest }}',
            ASSISTANT_WORKER_DEPLOY_IMAGE: '${{ env.REGISTRY }}/${{ env.REPO }}-assistant-worker@${{ needs.release-artifact.outputs.worker-digest }}',
        });
        expect(remote.with?.script).toContain('git checkout --detach "$DEPLOY_SHA"');
        expect(remote.with?.script).toContain('docker compose run --rm --no-deps -T --entrypoint ./release-migrate.sh polyflow');
        expect(remote.with?.script).toContain('docker compose up -d --no-deps --no-build polyflow');
        expect(remote.with?.script).not.toMatch(/docker build|npm |reset --hard|image prune/);
    });
});
