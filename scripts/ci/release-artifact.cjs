const { appendFileSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const INTEGER_PATTERN = /^[1-9][0-9]*$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const VERSION = 1;
const KEYS = ['version', 'repository', 'sha', 'runId', 'runAttempt', 'webDigest', 'workerDigest'];

function validateIdentity(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).sort().join(',') !== [...KEYS].sort().join(',')
        || value.version !== VERSION
        || !REPOSITORY_PATTERN.test(value.repository)
        || !SHA_PATTERN.test(value.sha)
        || !INTEGER_PATTERN.test(value.runId)
        || !INTEGER_PATTERN.test(value.runAttempt)
        || !DIGEST_PATTERN.test(value.webDigest)
        || !DIGEST_PATTERN.test(value.workerDigest)) {
        throw new Error('Invalid release artifact identity');
    }
    return value;
}

function createManifest(env) {
    return validateIdentity({
        version: VERSION,
        repository: env.GITHUB_REPOSITORY,
        sha: env.GITHUB_SHA,
        runId: env.GITHUB_RUN_ID,
        runAttempt: env.GITHUB_RUN_ATTEMPT,
        webDigest: env.WEB_IMAGE_DIGEST,
        workerDigest: env.WORKER_IMAGE_DIGEST,
    });
}

function verifyManifest(value, env) {
    const manifest = validateIdentity(value);
    if (manifest.repository !== env.GITHUB_REPOSITORY
        || manifest.sha !== env.EXPECTED_RELEASE_SHA
        || manifest.runId !== env.EXPECTED_RUN_ID
        || manifest.runAttempt !== env.EXPECTED_RUN_ATTEMPT) {
        throw new Error('Release artifact does not match the approved Push CI run');
    }
    return manifest;
}

function writeOutputs(path, manifest) {
    appendFileSync(path, [
        `release-sha=${manifest.sha}`,
        `digest=${manifest.webDigest}`,
        `worker-digest=${manifest.workerDigest}`,
    ].join('\n') + '\n');
}

function main(args = process.argv.slice(2), env = process.env) {
    try {
        const [mode, file] = args;
        if (!file) throw new Error('Release artifact path is required');
        const target = resolve(file);
        if (mode === 'create') {
            const manifest = createManifest(env);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, `${JSON.stringify(manifest)}\n`, { flag: 'wx' });
            return 0;
        }
        if (mode === 'verify') {
            const manifest = verifyManifest(JSON.parse(readFileSync(target, 'utf8')), env);
            if (!env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
            writeOutputs(env.GITHUB_OUTPUT, manifest);
            return 0;
        }
        throw new Error('Unknown release artifact mode');
    } catch {
        console.error('Release artifact verification failed; release is blocked.');
        return 1;
    }
}

if (require.main === module) process.exitCode = main();

module.exports = { createManifest, main, validateIdentity, verifyManifest, writeOutputs };
