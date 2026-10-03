import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml') as { load(text: string): { jobs: { deploy: { steps: { name?: string; with?: { script?: string } }[] } } } };
const script = load(readFileSync('.github/workflows/production.yml', 'utf8')).jobs.deploy.steps
    .find(step => step.name === 'Deploy via SSH')?.with?.script;
const image = `ghcr.io/fixture/app@sha256:${'b'.repeat(64)}`;
const workerImage = `ghcr.io/fixture/assistant-worker@sha256:${'c'.repeat(64)}`;
interface Command { name: string; args: string[]; image?: string; workerImage?: string }

// Stub only external tools; execute the actual workflow's Bash and environment wiring.
function run(overrides: Partial<Record<'DEPLOY_SHA' | 'DEPLOY_IMAGE' | 'ASSISTANT_WORKER_DEPLOY_IMAGE' | 'FAIL_AT', string>> = {}) {
    if (!script) throw new Error('Missing deployment script');
    const home = mkdtempSync(join(tmpdir(), 'ci-release-script-'));
    const bin = join(home, 'bin');
    const log = join(home, 'calls.jsonl');
    mkdirSync(bin);
    mkdirSync(join(home, 'polyflow'));
    const stub = `#!${process.execPath}
const {appendFileSync}=require('node:fs');
const name=require('node:path').basename(process.argv[1]);
const args=process.argv.slice(2);
appendFileSync(process.env.CALL_LOG, JSON.stringify({name,args,image:process.env.POLYFLOW_IMAGE,workerImage:process.env.ASSISTANT_WORKER_IMAGE})+'\\n');
if (name+' '+args.join(' ')===process.env.FAIL_AT) process.exit(17);
if (name==='docker' && args[0]==='login') process.stdin.resume();
if (name==='docker' && args[0]==='inspect') console.log('healthy');
`;
    for (const name of ['git', 'docker']) {
        writeFileSync(join(bin, name), stub);
        chmodSync(join(bin, name), 0o700);
    }
    try {
        const result = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: {
            NODE_ENV: 'test', PATH: `${bin}:${process.env.PATH}`, HOME: home, CALL_LOG: log,
            DEPLOY_SHA: 'a'.repeat(40), DEPLOY_IMAGE: image, ASSISTANT_WORKER_DEPLOY_IMAGE: workerImage,
            REGISTRY_USER: 'fixture', CR_PAT: 'fixture-only',
            ...overrides,
        } });
        const calls: Command[] = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as Command) : [];
        return { result, calls };
    } finally { rmSync(home, { recursive: true, force: true }); }
}

describe('release shell contract', () => {
    it('executes exact checkout, dual-service pull and no-build recreate in order with immutable images', () => {
        const { result, calls } = run();
        expect(result.status, result.stderr).toBe(0);
        expect(calls.map(call => [call.name, ...call.args].join(' '))).toEqual([
            'git diff --quiet', 'git diff --cached --quiet', 'git fetch origin main',
            `git checkout --detach ${'a'.repeat(40)}`,
            'docker login ghcr.io -u fixture --password-stdin',
            'docker compose pull assistant-worker polyflow',
            'docker compose up -d --no-deps --no-build assistant-worker',
            'docker inspect --format {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}} polyflow-assistant-worker',
            'docker compose up -d --no-deps --no-build polyflow',
        ]);
        const web = calls.filter(call => call.args.includes('polyflow'));
        const worker = calls.filter(call => call.args.includes('assistant-worker'));
        expect(web.length).toBeGreaterThan(0);
        expect(worker.length).toBeGreaterThan(0);
        expect(web.every(call => call.image === image)).toBe(true);
        expect(worker.every(call => call.workerImage === workerImage)).toBe(true);
        expect(JSON.stringify(calls) + result.stdout + result.stderr).not.toContain('fixture-only');
    });

    it.each([
        'git diff --quiet', 'git diff --cached --quiet', 'git fetch origin main',
        `git checkout --detach ${'a'.repeat(40)}`, 'docker login ghcr.io -u fixture --password-stdin',
        'docker compose pull assistant-worker polyflow',
        'docker compose up -d --no-deps --no-build assistant-worker',
    ])('does not recreate the web container after %s fails', failure => {
        const { result, calls } = run({ FAIL_AT: failure });
        expect(result.status).toBe(17);
        expect(calls.some(call => call.args.includes('up') && call.args.includes('polyflow'))).toBe(false);
        expect([calls.at(-1)?.name, ...calls.at(-1)!.args].join(' ')).toBe(failure);
    });

    it('does not promote the web container when the final web recreate fails', () => {
        const failure = 'docker compose up -d --no-deps --no-build polyflow';
        const { result, calls } = run({ FAIL_AT: failure });
        expect(result.status).toBe(17);
        expect([calls.at(-1)?.name, ...calls.at(-1)!.args].join(' ')).toBe(failure);
    });

    it.each([{ DEPLOY_SHA: 'main;command' }, { DEPLOY_IMAGE: 'ghcr.io/fixture/app:latest' }, { DEPLOY_IMAGE: `${image};command` },
        { ASSISTANT_WORKER_DEPLOY_IMAGE: 'ghcr.io/fixture/assistant-worker:latest' },
        { ASSISTANT_WORKER_DEPLOY_IMAGE: `${workerImage};command` }])(
        'rejects malformed release identifiers before any remote operation (%j)', values => {
            const { result, calls } = run(values);
            expect(result.status).not.toBe(0);
            expect(calls).toEqual([]);
        },
    );
});
