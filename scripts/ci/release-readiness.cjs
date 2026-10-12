const SHA_PATTERN = /^[a-f0-9]{40}$/;
const ACTIVE = new Set(['queued', 'in_progress', 'pending', 'requested', 'waiting']);
const WORKFLOW_ID = 'ci.yml';

function latestExactRun(response, sha) {
    const runs = response?.data?.workflow_runs;
    if (!Array.isArray(runs)) throw new Error('Push CI response is incomplete');
    return runs
        .filter(run => run?.head_sha === sha && run?.head_branch === 'main' && run?.event === 'push')
        .sort((left, right) => Number(right.id) - Number(left.id))[0];
}

async function check({ github, context, core, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    attempts = 30, intervalMs = 30_000 }) {
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
        const run = latestExactRun(response, context.sha);
        if (run?.status === 'completed') {
            if (run.conclusion !== 'success') throw new Error('Exact-SHA Push CI did not succeed');
            core.setOutput('run-id', String(run.id));
            core.notice('Exact-SHA Push CI succeeded; release gates may start');
            return;
        }
        if (run && !ACTIVE.has(run.status)) throw new Error('Exact-SHA Push CI returned an unknown state');
        if (attempt === attempts) throw new Error('Exact-SHA Push CI was not successful before the readiness deadline');
        core.info(run ? 'Exact-SHA Push CI is still running' : 'Waiting for exact-SHA Push CI to appear');
        await sleep(intervalMs);
    }
}

module.exports = { check, latestExactRun };
