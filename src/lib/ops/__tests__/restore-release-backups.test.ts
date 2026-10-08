import { chmod, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const script = resolve(process.cwd(), 'scripts/restore-release-backups.sh');

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'restore-drill-contract-'));
    const backups = join(root, 'backups');
    const bin = join(root, 'bin');
    await mkdir(backups);
    await mkdir(bin);
    const dockerLog = join(root, 'docker.log');
    const docker = join(bin, 'docker');
    await writeFile(docker, '#!/bin/sh\nprintf "%s\n" "$*" >> "$DOCKER_LOG"\nexit 99\n');
    await chmod(docker, 0o755);
    return { root, backups, bin, dockerLog };
}

async function run(env: Record<string, string>) {
    try {
        const result = await execFileAsync('bash', [script], { env: { ...process.env, ...env } });
        return { code: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
        const failure = error as { code: number; stdout: string; stderr: string };
        return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
    }
}

describe('isolated release restore drill contract', () => {
    it('fails before Docker when immutable image or expected database count is absent', async () => {
        const { backups, bin, dockerLog } = await fixture();
        const result = await run({ BACKUP_DIR: backups, PATH: `${bin}:${process.env.PATH}`, DOCKER_LOG: dockerLog });
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain('EXPECTED_DATABASES must be a positive integer');
        await expect(import('node:fs/promises').then(({ readFile }) => readFile(dockerLog, 'utf8'))).rejects.toThrow();
    });

    it('rejects an incomplete backup set before creating drill resources', async () => {
        const { backups, bin, dockerLog } = await fixture();
        await writeFile(join(backups, 'release_20261008053040_1.dump'), 'synthetic backup');
        const result = await run({
            BACKUP_DIR: backups,
            BACKUP_STAMP: '20261008053040',
            EXPECTED_DATABASES: '2',
            APP_IMAGE: 'registry.invalid/polyflow@sha256:synthetic',
            PATH: `${bin}:${process.env.PATH}`,
            DOCKER_LOG: dockerLog,
        });
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain('incomplete at database #2');
        await expect(import('node:fs/promises').then(({ readFile }) => readFile(dockerLog, 'utf8'))).rejects.toThrow();
    });

    it('uses an internal network, read-only backups, disposable volume, and cleanup trap', async () => {
        const source = await import('node:fs/promises').then(({ readFile }) => readFile(script, 'utf8'));
        expect(source).toContain('docker network create --internal');
        expect(source).toContain('dst=/backups,readonly');
        expect(source).toContain('type=volume,src=$VOLUME,dst=/var/lib/postgresql/data');
        expect(source).toContain('trap cleanup EXIT INT TERM');
        expect(source).toContain('docker volume rm "$VOLUME"');
        expect(source).not.toMatch(/-p\s|--publish/);
    });

    it('verifies restore, migration status, structural invariants, and app health without logging URLs', async () => {
        const source = await import('node:fs/promises').then(({ readFile }) => readFile(script, 'utf8'));
        expect(source).toContain('docker exec -e PGHOST=/tmp "$DB_CONTAINER" pg_restore');
        expect(source).toContain('migrate status');
        expect(source).toContain('failed structural invariants');
        expect(source).toContain('--network "$NETWORK"');
        expect(source).not.toContain('UPDATE "Tenant"');
        expect(source).toContain('/api/health');
        expect(source).toContain('RESTORE_DRILL_OK');
        expect(source).not.toContain('echo "$database_url"');
    });
});
