// Reject stale/malformed releases before any registry promotion or SSH mutation.
async function check({ github, context, core, digest, workerDigest }) {
    if (context.ref !== 'refs/heads/main' || !/^[a-f0-9]{40}$/.test(context.sha)
        || !/^sha256:[a-f0-9]{64}$/.test(digest)
        || (workerDigest !== undefined && !/^sha256:[a-f0-9]{64}$/.test(workerDigest))) {
        throw new Error('Invalid release identity: expected main, full SHA and image digest');
    }
    const { data } = await github.rest.repos.getCommit({ ...context.repo, ref: 'main' });
    const current = data.sha === context.sha;
    core.setOutput('current', String(current));
    if (!current) core.notice('Superseded release: skipping image promotion and deployment');
}

module.exports = { check };
