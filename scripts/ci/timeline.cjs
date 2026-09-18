// Run from actions/github-script, or import in regression tests. Never logs API bodies.
function summarize(jobs, startedAt, completedAt) {
    const seconds = (start, end) => start && end ? Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000) : null;
    const completed = jobs.filter(job => job.completed_at && job.started_at);
    const end = completedAt || completed.map(job => job.completed_at).sort().at(-1);
    return {
        wallSeconds: seconds(startedAt, end),
        // Occupied job time, not billed/rounded minutes or a dollar estimate.
        runnerMinutes: completed.reduce((sum, job) => sum + seconds(job.started_at, job.completed_at), 0) / 60,
        jobs: completed.map(job => ({ name: job.name, conclusion: job.conclusion,
            seconds: seconds(job.started_at, job.completed_at),
            steps: (job.steps || []).map(step => ({ name: step.name, conclusion: step.conclusion,
                seconds: seconds(step.started_at, step.completed_at) })) })),
    };
}

// BuildKit --progress=plain output: extract only cache vertex timings, not build logs.
function cacheTimings(log) {
    const vertices = new Map();
    const phases = [];
    for (const line of log.split('\n')) {
        const match = line.match(/#(\d+) (.*)/);
        if (!match) continue;
        const [, id, text] = match;
        if (/importing cache manifest/.test(text)) vertices.set(id, 'cache-import');
        if (/exporting cache to/.test(text)) vertices.set(id, 'cache-export');
        const done = text.match(/^DONE ([\d.]+)s/);
        if (done && vertices.has(id)) {
            phases.push({ phase: vertices.get(id), seconds: Number(done[1]) });
            vertices.delete(id);
        }
    }
    return phases;
}

async function report({ github, context, core }) {
    const { owner, repo } = context.repo;
    const run = (await github.rest.actions.getWorkflowRun({ owner, repo, run_id: context.runId })).data;
    const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
        owner, repo, run_id: context.runId, attempt_number: Number(process.env.GITHUB_RUN_ATTEMPT), per_page: 100,
    });
    const result = summarize(jobs, run.run_started_at);
    result.cache = [];
    for (const job of jobs.filter(job => job.name === 'Build & Push Docker Image' && job.completed_at)) {
        try {
            const logs = await github.rest.actions.downloadJobLogsForWorkflowRun({ owner, repo, job_id: job.id });
            if (typeof logs.data === 'string') result.cache.push(...cacheTimings(logs.data));
        } catch { core.warning('Build cache timing unavailable; inspect the BuildKit record.'); }
    }
    core.info(`CI_TIMELINE ${JSON.stringify(result)}`);
    await core.summary.addHeading('CI timing (current attempt)')
        .addRaw('Wall time through completed jobs; this summary job and its post steps are excluded. Runner-minutes sum job occupancy, not billing.\n')
        .addCodeBlock(JSON.stringify(result, null, 2), 'json').write();
}

module.exports = { summarize, cacheTimings, report };
