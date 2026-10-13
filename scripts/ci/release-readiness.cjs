const { execFileSync } = require('node:child_process');
const { safeDocuments } = require('./safe-documents.cjs');

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const ACTIVE = new Set(['queued', 'in_progress', 'pending', 'requested', 'waiting']);
const WORKFLOW_ID = 'ci.yml';
const SAFE_DOCUMENTS = new Set(safeDocuments);
class NoReleaseArtifactError extends Error {}

function exactRun(response, sha) {
    const runs = response?.data?.workflow_runs;
    if (!Array.isArray(runs)) throw new Error('Push CI response is incomplete');
    return runs
        .filter(run => run?.head_sha === sha && run?.head_branch === 'main' && run?.event === 'push')
        .sort((left, right) => Number(right.id) - Number(left.id))[0];
}

async function latestSuccessfulArtifactRun({ github, context, eligible = () => true, perPage = 100 }) {
    const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
        ...context.repo,
        workflow_id: WORKFLOW_ID,
        branch: 'main',
        event: 'push',
        status: 'completed',
        per_page: perPage,
    });
    const candidates = runs
        .filter(run => run?.event === 'push' && run?.head_branch === 'main'
            && run?.status === 'completed' && run?.conclusion === 'success'
            && Number.isInteger(run?.run_attempt) && run.run_attempt > 0
            && SHA_PATTERN.test(run?.head_sha || ''))
        .sort((left, right) => Number(right.id) - Number(left.id));
    for (const run of candidates) {
        const expected = `release-${run.id}-${run.run_attempt}-${run.head_sha}`;
        let response;
        try {
            response = await github.rest.actions.listWorkflowRunArtifacts({
                ...context.repo,
                run_id: run.id,
                name: expected,
                per_page: 10,
            });
        } catch {
            continue;
        }
        const artifacts = response?.data?.artifacts;
        if (!Array.isArray(artifacts)) throw new Error('Artifact response is incomplete');
        const matching = artifacts.filter(artifact => !artifact.expired && artifact.name === expected);
        if (matching.length > 1) throw new Error('Duplicate release artifacts are not allowed');
        if (matching.length === 1) {
            try {
                if (eligible(run)) return run;
            } catch {
                // A candidate from a newer/nonancestor or unsafe history is not
                // eligible; keep searching older artifacts without weakening policy.
            }
        }
    }
    throw new NoReleaseArtifactError('No successful Push CI release artifact is available');
}

function git(root, ...args) {
    return execFileSync('git', ['-C', root, ...args], {
        encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

function assertSafeReleaseDelta(root, releaseSha, headSha) {
    if (![releaseSha, headSha].every(value => SHA_PATTERN.test(value))) throw new Error('Invalid release SHA');
    git(root, 'merge-base', '--is-ancestor', releaseSha, headSha);
    if (releaseSha === headSha) return;
    const commits = git(root, 'rev-list', '--reverse', '--ancestry-path', `${releaseSha}..${headSha}`)
        .split('\n').filter(Boolean);
    if (!commits.length || commits.at(-1) !== headSha) throw new Error('Release history is incomplete');
    let parent = releaseSha;
    for (const commit of commits) {
        const parents = git(root, 'show', '-s', '--format=%P', commit).split(' ').filter(Boolean);
        if (parents.length !== 1 || parents[0] !== parent) throw new Error('Release history is not linear');
        const paths = git(root, 'diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', commit)
            .split('\n').filter(Boolean);
        if (!paths.length || !paths.every(path => SAFE_DOCUMENTS.has(path))) {
            throw new Error('Intervening commit is not safe-document-only');
        }
        parent = commit;
    }
}

async function check({ github, context, core, root = process.cwd(),
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 30, intervalMs = 30_000 }) {
    if (context.ref !== 'refs/heads/main' || !SHA_PATTERN.test(context.sha)
        || !Number.isInteger(attempts) || attempts < 1 || !Number.isInteger(intervalMs) || intervalMs < 0) {
        throw new Error('Invalid release readiness identity');
    }
    for (let attempt = 1; attempt <= attempts; attempt++) {
        const response = await github.rest.actions.listWorkflowRuns({
            ...context.repo,
            workflow_id: WORKFLOW_ID,
            branch: 'main',
            event: 'push',
            head_sha: context.sha,
            per_page: 20,
        });
        const current = exactRun(response, context.sha);
        if (!current) {
            if (attempt === attempts) throw new Error('Exact-SHA Push CI did not appear before the readiness deadline');
            core.info('Waiting for exact-SHA Push CI to appear');
            await sleep(intervalMs);
            continue;
        }
        if (current.status !== 'completed' && !ACTIVE.has(current.status)) {
            throw new Error('Exact-SHA Push CI returned an unknown state');
        }
        if (current.status !== 'completed') {
            if (attempt === attempts) throw new Error('Exact-SHA Push CI was not complete before the readiness deadline');
            core.info('Exact-SHA Push CI is still running');
            await sleep(intervalMs);
            continue;
        }
        if (current.conclusion !== 'success') throw new Error('Exact-SHA Push CI did not succeed');
        let releaseRun;
        try {
            releaseRun = await latestSuccessfulArtifactRun({
                github,
                context,
                eligible: run => {
                    assertSafeReleaseDelta(root, run.head_sha, context.sha);
                    return true;
                },
            });
        } catch (error) {
            if (!(error instanceof NoReleaseArtifactError) || attempt === attempts) throw error;
            core.info('Waiting for an eligible full Push CI release artifact');
            await sleep(intervalMs);
            continue;
        }
        core.setOutput('run-id', String(releaseRun.id));
        core.setOutput('run-attempt', String(releaseRun.run_attempt));
        core.setOutput('release-sha', releaseRun.head_sha);
        core.notice(releaseRun.head_sha === context.sha
            ? 'Exact-SHA Push CI release artifact approved'
            : 'Latest full Push CI ancestor approved across safe document-only changes');
        return;
    }
}

module.exports = { NoReleaseArtifactError, assertSafeReleaseDelta, check, exactRun, latestSuccessfulArtifactRun };
