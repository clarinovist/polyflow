import { chmod, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
const runFile = promisify(execFile);
const script = resolve(process.cwd(), 'scripts/run-scheduled-backups.sh');
async function setup(databaseExit = 0, assistantExit = 0) {
    const root = await mkdtemp(join(tmpdir(), 'scheduled-backups-')); const repo = join(root, 'repo');
    const backups = join(root, 'backups'); const bin = join(root, 'bin');
    await Promise.all([mkdir(join(repo, 'scripts'), { recursive: true }), mkdir(backups), mkdir(bin)]);
    await writeFile(join(repo, '.env'), 'SYNTHETIC_ONLY=yes\n');
    await writeFile(join(repo, 'scripts/backup-db.sh'), '#!/bin/sh\nexit ' + databaseExit + '\n');
    await writeFile(join(bin, 'docker'), '#!/bin/sh\nexit ' + assistantExit + '\n');
    await chmod(join(bin, 'docker'), 0o755);
    return { root, repo, backups, bin };
}
async function run(f: Awaited<ReturnType<typeof setup>>) {
    try { const value = await runFile('bash', [script], { env: { ...process.env, REPO_DIR: f.repo,
        BACKUP_DIR: f.backups, PATH: f.bin + ':' + process.env.PATH } }); return { code: 0, output: value.stdout }; }
    catch (error) { const failure = error as { code: number; stdout: string; stderr: string };
        return { code: failure.code, output: failure.stdout + failure.stderr }; }
}
describe('scheduled production backup runner', () => {
    it('marks success only after database and assistant backups pass', async () => {
        const f = await setup(); const result = await run(f); expect(result.code).toBe(0);
        await expect(readFile(join(f.backups, '.last-success'), 'utf8')).resolves.toBeDefined();
    });
    it('records a sanitized database failure and does not mark success', async () => {
        const f = await setup(1); const result = await run(f); expect(result.code).toBe(1);
        await expect(readFile(join(f.backups, '.last-failure'), 'utf8')).resolves.toBe('database_backup_failed\n');
        expect(result.output).not.toContain(f.root);
    });
    it('records assistant failure after database backup succeeds', async () => {
        const f = await setup(0, 1); const result = await run(f); expect(result.code).toBe(1);
        await expect(readFile(join(f.backups, '.last-failure'), 'utf8')).resolves.toBe('assistant_backup_failed\n');
    });
});
