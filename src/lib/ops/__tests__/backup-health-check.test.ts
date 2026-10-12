import { chmod, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
const runFile = promisify(execFile);
const script = resolve(process.cwd(), 'scripts/check-backup-health.sh');
const SOURCE_KEYS = ['a'.repeat(64), 'b'.repeat(64)];
async function fixture(sourceCount = 0) {
    const root = await mkdtemp(join(tmpdir(), 'backup-health-'));
    const db = join(root, 'db'); const assistant = join(root, 'assistant'); const bin = join(root, 'bin');
    await Promise.all([mkdir(db), mkdir(assistant), mkdir(bin)]);
    const keys = SOURCE_KEYS.slice(0, sourceCount).map(
        (key) => `/data/tenants/${key}/assistant.sqlite`,
    ).join('\n');
    await writeFile(join(bin, 'docker'), '#!/bin/sh\ncase "$1" in inspect) exit 0;; exec) printf \'%s\n\' \'' + keys + '\';; esac\n');
    await chmod(join(bin, 'docker'), 0o755);
    return { root, db, assistant, bin };
}
async function run(f: { db: string; assistant: string; bin: string }) {
    try {
        const value = await runFile('bash', [script], { env: { ...process.env, DB_BACKUP_DIR: f.db,
            ASSISTANT_BACKUP_DIR: f.assistant, PATH: f.bin + ':' + process.env.PATH,
            DISK_WARNING_PERCENT: '98', DISK_CRITICAL_PERCENT: '99' } });
        return { code: 0, output: value.stdout };
    } catch (error) {
        const failure = error as { code: number; stdout: string; stderr: string };
        return { code: failure.code, output: failure.stdout + failure.stderr };
    }
}
describe('production backup health check', () => {
    it('passes with a complete fresh database set and no assistant state', async () => {
        const f = await fixture(); await Promise.all([1, 2, 3].map((n) => writeFile(join(f.db, n + '.sql.gz'), 'fixture')));
        const result = await run(f); expect(result.code).toBe(0); expect(result.output).toContain('BACKUP_HEALTH_OK');
        expect(result.output).toContain('assistant_state=idle_not_initialized');
    });
    it('reports incomplete database backups without paths', async () => {
        const f = await fixture(); const result = await run(f); expect(result.code).toBe(1);
        expect(result.output).toContain('database_backup_stale_or_incomplete'); expect(result.output).not.toContain(f.root);
    });
    it('requires assistant snapshots only when durable SQLite sources exist', async () => {
        const f = await fixture(2); await Promise.all([1, 2, 3].map((n) => writeFile(join(f.db, n + '.sql.gz'), 'fixture')));
        const result = await run(f); expect(result.code).toBe(1); expect(result.output).toContain('assistant_backup_incomplete');
    });
    it('fails when only one of two sources has a fresh snapshot', async () => {
        const f = await fixture(2); await Promise.all([1, 2, 3].map((n) => writeFile(join(f.db, n + '.sql.gz'), 'fixture')));
        await mkdir(join(f.assistant, '20260101-000000', 'a'.repeat(64)), { recursive: true });
        await writeFile(join(f.assistant, '20260101-000000', 'a'.repeat(64), 'assistant.sqlite'), 'fixture');
        const result = await run(f); expect(result.code).toBe(1); expect(result.output).toContain('assistant_backup_incomplete');
    });
    it('passes when every source has a fresh snapshot', async () => {
        const f = await fixture(2); await Promise.all([1, 2, 3].map((n) => writeFile(join(f.db, n + '.sql.gz'), 'fixture')));
        for (const key of SOURCE_KEYS) {
            await mkdir(join(f.assistant, '20260101-000000', key), { recursive: true });
            await writeFile(join(f.assistant, '20260101-000000', key, 'assistant.sqlite'), 'fixture');
        }
        const result = await run(f); expect(result.code).toBe(0); expect(result.output).toContain('BACKUP_HEALTH_OK');
    });
    it('reports a registry-storage mismatch marker until a newer success', async () => {
        const f = await fixture(); await Promise.all([1, 2, 3].map((n) => writeFile(join(f.db, n + '.sql.gz'), 'fixture')));
        await writeFile(join(f.assistant, '.assistant-registry-mismatch'), 'assistant_registry_storage_mismatch registry=1 sources=0 snapshots=0\n');
        const result = await run(f); expect(result.code).toBe(1); expect(result.output).toContain('assistant_registry_storage_mismatch');
    });
    it('reports a newer scheduled failure marker', async () => {
        const f = await fixture(); await Promise.all([1, 2, 3].map((n) => writeFile(join(f.db, n + '.sql.gz'), 'fixture')));
        await writeFile(join(f.db, '.last-failure'), 'database_backup_failed\n');
        const result = await run(f); expect(result.code).toBe(1); expect(result.output).toContain('scheduled_backup_failed');
        expect(result.output).not.toContain('database_backup_failed');
    });
});
