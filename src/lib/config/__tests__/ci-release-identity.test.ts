import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
interface Step {
    id?: string;
    name?: string;
    uses?: string;
    if?: string;
    env?: Record<string, string>;
    with?: Record<string, string>;
}
interface Job {
    steps: Step[];
    outputs?: Record<string, string>;
    concurrency?: { group: string; 'cancel-in-progress': boolean };
}
const { load } = require('js-yaml') as { load(text: string): { jobs: Record<string, Job> } };
const { jobs } = load(readFileSync('.github/workflows/production.yml', 'utf8'));
const sha = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;
const dependencies = () => ({
    github: { rest: { repos: { getCommit: vi.fn().mockResolvedValue({ data: { sha } }) } } },
    context: { sha, ref: 'refs/heads/main', repo: { owner: 'fixture', repo: 'app' } },
    core: { setOutput: vi.fn(), notice: vi.fn() },
    digest,
});
const check = (input: ReturnType<typeof dependencies>) => {
    const guard = require('../../../../scripts/ci/release-guard.cjs') as { check(value: typeof input): Promise<void> };
    return guard.check(input);
};

describe('release identity guard', () => {
    it('allows only the current main SHA with a valid immutable digest', async () => {
        const input = dependencies();
        await check(input);
        expect(input.github.rest.repos.getCommit).toHaveBeenCalledWith({ owner: 'fixture', repo: 'app', ref: 'main' });
        expect(input.core.setOutput).toHaveBeenCalledWith('current', 'true');
    });

    it('rejects superseded releases without authorizing mutation', async () => {
        const input = dependencies();
        input.github.rest.repos.getCommit.mockResolvedValue({ data: { sha: 'c'.repeat(40) } });
        await check(input);
        expect(input.core.setOutput).toHaveBeenCalledWith('current', 'false');
        expect(input.core.setOutput).not.toHaveBeenCalledWith('current', 'true');
    });

    it('propagates API errors rather than treating an unavailable head as current', async () => {
        const input = dependencies();
        input.github.rest.repos.getCommit.mockRejectedValue(new Error('unavailable'));
        await expect(check(input)).rejects.toThrow('unavailable');
        expect(input.core.setOutput).not.toHaveBeenCalledWith('current', 'true');
    });

    it.each(['', 'latest', 'sha256:bad', `${digest};command`])('rejects invalid digest %j before API calls', async value => {
        const input = { ...dependencies(), digest: value };
        await expect(check(input)).rejects.toThrow('identity');
        expect(input.github.rest.repos.getCommit).not.toHaveBeenCalled();
    });

    it('rejects non-main refs and malformed commit IDs', async () => {
        const input = dependencies();
        await expect(check({ ...input, context: { ...input.context, ref: 'refs/heads/other' } })).rejects.toThrow('identity');
        await expect(check({ ...input, context: { ...input.context, sha: 'main;command' } })).rejects.toThrow('identity');
    });
});

describe('SHA-safe deployment wiring', () => {
    it('serializes deployments and exposes the exact built digest', () => {
        expect(jobs.deploy.concurrency).toEqual({ group: 'production-deploy', 'cancel-in-progress': false });
        expect(jobs['build-and-push'].outputs).toEqual({ digest: '${{ steps.image.outputs.digest }}' });
        expect(jobs['build-and-push'].steps.find(item => item.name === 'Build and push Docker image')?.id).toBe('image');
    });

    it('guards every mutating step before image promotion or SSH', () => {
        const guardIndex = jobs.deploy.steps.findIndex(item => item.id === 'revision');
        expect(guardIndex).toBeGreaterThanOrEqual(0);
        const guard = jobs.deploy.steps[guardIndex];
        expect(guard.env?.IMAGE_DIGEST).toBe('${{ needs.build-and-push.outputs.digest }}');
        expect(guard.with?.script).toContain("require('./scripts/ci/release-guard.cjs').check");
        for (const name of ['Log in to Container Registry', 'Promote tested image to :latest', 'Deploy via SSH']) {
            const index = jobs.deploy.steps.findIndex(item => item.name === name);
            expect(index).toBeGreaterThan(guardIndex);
            expect(jobs.deploy.steps[index].if).toBe("steps.revision.outputs.current == 'true'");
        }
    });

    it('binds runtime checkout and image to verified metadata without deleting WIP or pruning images', () => {
        const remote = jobs.deploy.steps.find(item => item.name === 'Deploy via SSH');
        expect(remote?.env).toMatchObject({ DEPLOY_SHA: '${{ github.sha }}', DEPLOY_IMAGE: '${{ env.REGISTRY }}/${{ env.REPO }}@${{ needs.build-and-push.outputs.digest }}' });
        expect(remote?.with?.envs).toContain('DEPLOY_SHA');
        expect(remote?.with?.envs).toContain('DEPLOY_IMAGE');
        expect(remote?.with?.script).toContain('git checkout --detach "$DEPLOY_SHA"');
        expect(remote?.with?.script).toContain('export POLYFLOW_IMAGE="$DEPLOY_IMAGE"');
        expect(remote?.with?.script).toContain('docker compose up -d --no-deps --no-build polyflow');
        expect(remote?.with?.script).not.toMatch(/reset --hard|docker rm|image prune|docker build|npm /);
        const compose = load(readFileSync('docker-compose.yml', 'utf8')) as unknown as { services: { polyflow: { image: string } } };
        expect(compose.services.polyflow.image).toMatch(/^\$\{POLYFLOW_IMAGE:-.*:latest\}$/);
    });
});
