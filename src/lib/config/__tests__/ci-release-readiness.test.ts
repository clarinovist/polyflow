import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const readiness = require('../../../../scripts/ci/release-readiness.cjs') as {
    check(input: Record<string, unknown>): Promise<void>;
    assertSafeReleaseDelta(root: string, releaseSha: string, headSha: string): void;
};
const artifact = require('../../../../scripts/ci/release-artifact.cjs') as {
    createManifest(env: Record<string, string>): Record<string, unknown>;
    validateIdentity(value: unknown): Record<string, unknown>;
    verifyManifest(value: unknown, env: Record<string, string>): Record<string, unknown>;
};
const sha = 'a'.repeat(40);
const digest = `sha256:${'b'.repeat(64)}`;
const workerDigest = `sha256:${'c'.repeat(64)}`;
const run = (patch: Record<string, unknown> = {}) => ({
    id: 123, run_attempt: 2, head_sha: sha, head_branch: 'main', event: 'push',
    status: 'completed', conclusion: 'success', ...patch,
});
const dependencies = (exactRuns: Record<string, unknown>[], releaseRuns?: Record<string, unknown>[]) => {
    const fixture = syntheticRepo();
    const actualSha = fixture.git('rev-parse', 'HEAD');
    const normalize = (item: Record<string, unknown>) => ({ ...item, head_sha: actualSha });
    return {
        github: {
            rest: { actions: {
                listWorkflowRuns: vi.fn().mockResolvedValue({ data: { workflow_runs: exactRuns.map(normalize) } }),
                listWorkflowRunArtifacts: vi.fn().mockResolvedValue({ data: {
                    artifacts: [{ name: `release-123-2-${actualSha}`, expired: false }],
                } }),
            } },
            paginate: vi.fn().mockResolvedValue((releaseRuns ?? [run()]).map(normalize)),
        },
        context: { sha: actualSha, ref: 'refs/heads/main', repo: { owner: 'fixture', repo: 'app' } },
        core: { setOutput: vi.fn(), notice: vi.fn(), info: vi.fn() },
        root: fixture.root, sleep: vi.fn().mockResolvedValue(undefined), attempts: 2, intervalMs: 0,
    };
};

function syntheticRepo() {
    const root = mkdtempSync(resolve(tmpdir(), 'release-readiness-'));
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
    git('init', '-q');
    git('config', 'user.name', 'CI Test'); git('config', 'user.email', 'ci@example.invalid');
    mkdirSync(resolve(root, 'docs/development'), { recursive: true });
    writeFileSync(resolve(root, 'src.ts'), 'one\n');
    writeFileSync(resolve(root, 'docs/development/ci-selective.md'), 'one\n');
    git('add', '.'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
    return { root, git, base };
}

describe('release artifact manifest', () => {
    const env = {
        GITHUB_REPOSITORY: 'fixture/app', GITHUB_SHA: sha, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '2',
        WEB_IMAGE_DIGEST: digest, WORKER_IMAGE_DIGEST: workerDigest,
    };
    it('round-trips exact repository, SHA, run, attempt and digests', () => {
        const manifest = artifact.createManifest(env);
        expect(artifact.verifyManifest(manifest, {
            GITHUB_REPOSITORY: 'fixture/app', EXPECTED_RELEASE_SHA: sha,
            EXPECTED_RUN_ID: '123', EXPECTED_RUN_ATTEMPT: '2',
        })).toEqual(manifest);
    });
    it.each([
        {}, { ...artifact.createManifest(env), extra: true },
        { ...artifact.createManifest(env), sha: 'main' },
        { ...artifact.createManifest(env), webDigest: 'latest' },
        { ...artifact.createManifest(env), repository: 'bad' },
    ])('rejects malformed/expanded manifests %#', value => {
        expect(() => artifact.validateIdentity(value)).toThrow('identity');
    });
    it.each([
        { GITHUB_REPOSITORY: 'other/app', EXPECTED_RELEASE_SHA: sha, EXPECTED_RUN_ID: '123', EXPECTED_RUN_ATTEMPT: '2' },
        { GITHUB_REPOSITORY: 'fixture/app', EXPECTED_RELEASE_SHA: 'd'.repeat(40), EXPECTED_RUN_ID: '123', EXPECTED_RUN_ATTEMPT: '2' },
        { GITHUB_REPOSITORY: 'fixture/app', EXPECTED_RELEASE_SHA: sha, EXPECTED_RUN_ID: '999', EXPECTED_RUN_ATTEMPT: '2' },
        { GITHUB_REPOSITORY: 'fixture/app', EXPECTED_RELEASE_SHA: sha, EXPECTED_RUN_ID: '123', EXPECTED_RUN_ATTEMPT: '3' },
    ])('rejects manifest identity mismatch %#', expected => {
        expect(() => artifact.verifyManifest(artifact.createManifest(env), expected)).toThrow('approved');
    });
});

describe('exact Push CI and ancestor release readiness', () => {
    it('accepts exact completed successful run and its unique artifact', async () => {
        const input = dependencies([run()]);
        await readiness.check(input);
        expect(input.core.setOutput).toHaveBeenCalledWith('run-id', '123');
        expect(input.core.setOutput).toHaveBeenCalledWith('run-attempt', '2');
        expect(input.core.setOutput).toHaveBeenCalledWith('release-sha', input.context.sha);
    });
    it('waits when exact run is absent or active, then succeeds', async () => {
        for (const first of [[], [run({ status: 'in_progress', conclusion: null })]]) {
            const input = dependencies(first);
            input.github.rest.actions.listWorkflowRuns
                .mockResolvedValueOnce({ data: { workflow_runs: first } })
                .mockResolvedValueOnce({ data: { workflow_runs: [run({ head_sha: input.context.sha })] } });
            await readiness.check(input);
            expect(input.sleep).toHaveBeenCalledOnce();
        }
    });
    it.each(['failure', 'cancelled', 'timed_out', 'skipped'])('blocks exact %s run', async conclusion => {
        await expect(readiness.check(dependencies([run({ conclusion })]))).rejects.toThrow('did not succeed');
    });
    it('blocks missing exact run at deadline and duplicate/expired release evidence', async () => {
        await expect(readiness.check(dependencies([]))).rejects.toThrow('did not appear');
        const duplicate = dependencies([run()]);
        duplicate.github.rest.actions.listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [
            { name: `release-123-2-${duplicate.context.sha}`, expired: false },
            { name: `release-123-2-${duplicate.context.sha}`, expired: false },
        ] } });
        await expect(readiness.check(duplicate)).rejects.toThrow('Duplicate');
        const expired = dependencies([run()]);
        expired.github.rest.actions.listWorkflowRunArtifacts.mockResolvedValue({ data: {
            artifacts: [{ name: `release-123-2-${expired.context.sha}`, expired: true }],
        } });
        await expect(readiness.check(expired)).rejects.toThrow('No successful');
    });
    it('skips newer ineligible artifacts and selects an older eligible ancestor', async () => {
        const input = dependencies([run()]);
        const newer = { ...run({ id: 999, run_attempt: 1, head_sha: 'd'.repeat(40) }) };
        const eligible = { ...run({ head_sha: input.context.sha }) };
        input.github.paginate.mockResolvedValue([newer, eligible]);
        input.github.rest.actions.listWorkflowRunArtifacts.mockImplementation(({ run_id }: { run_id: number }) =>
            Promise.resolve({ data: { artifacts: [{
                name: run_id === 999 ? `release-999-1-${'d'.repeat(40)}` : `release-123-2-${input.context.sha}`,
                expired: false,
            }] } }));
        await readiness.check(input);
        expect(input.core.setOutput).toHaveBeenCalledWith('run-id', '123');
    });
    it('allows linear safe-document-only descendants', () => {
        const { root, git, base } = syntheticRepo();
        writeFileSync(resolve(root, 'docs/development/ci-selective.md'), 'two\n');
        git('add', '.'); git('commit', '-qm', 'docs');
        expect(() => readiness.assertSafeReleaseDelta(root, base, git('rev-parse', 'HEAD'))).not.toThrow();
    });
    it('blocks a non-ancestor release candidate', () => {
        const fixture = syntheticRepo();
        fixture.git('checkout', '--orphan', 'orphan');
        fixture.git('rm', '-rf', '.');
        writeFileSync(resolve(fixture.root, 'README.md'), 'orphan\n'); fixture.git('add', '.'); fixture.git('commit', '-qm', 'orphan');
        expect(() => readiness.assertSafeReleaseDelta(fixture.root, fixture.base, fixture.git('rev-parse', 'HEAD'))).toThrow();
    });
    it('blocks unsafe touched-then-reverted files and merges', () => {
        const first = syntheticRepo();
        writeFileSync(resolve(first.root, 'src.ts'), 'two\n'); first.git('add', '.'); first.git('commit', '-qm', 'unsafe');
        writeFileSync(resolve(first.root, 'src.ts'), 'one\n'); first.git('add', '.'); first.git('commit', '-qm', 'revert');
        expect(() => readiness.assertSafeReleaseDelta(first.root, first.base, first.git('rev-parse', 'HEAD'))).toThrow('safe');

        const second = syntheticRepo();
        const initialBranch = second.git('branch', '--show-current');
        second.git('checkout', '-qb', 'side');
        writeFileSync(resolve(second.root, 'docs/development/ci-selective.md'), 'side\n'); second.git('add', '.'); second.git('commit', '-qm', 'side');
        second.git('checkout', '-q', initialBranch);
        writeFileSync(resolve(second.root, 'README.md'), 'main\n'); second.git('add', '.'); second.git('commit', '-qm', 'main');
        second.git('merge', '--no-ff', '-qm', 'merge', 'side');
        expect(() => readiness.assertSafeReleaseDelta(second.root, second.base, second.git('rev-parse', 'HEAD'))).toThrow('linear');
    });
});
