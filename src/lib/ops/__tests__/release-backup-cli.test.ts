import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runReleaseBackupCli, type ReleaseBackupCliDependencies } from '../../../../scripts/backup-release-databases';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function setup() {
    const root = mkdtempSync(join(tmpdir(), 'release-backup-cli-')); roots.push(root);
    const backupDir = join(root, 'backups'); mkdirSync(backupDir);
    const registry = {
        tenant: { findMany: vi.fn().mockResolvedValue([{ dbUrl: 'postgresql://u:p@db.invalid/tenant' }]) },
        $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const dependencies = {
        mainDatabaseUrl: 'postgresql://u:p@db.invalid/main', backupDir,
        createRegistry: vi.fn(() => registry), now: () => new Date('2026-01-02T03:04:05Z'),
        execute: vi.fn<ReleaseBackupCliDependencies['execute']>().mockImplementation(async (file, args) => {
            if (file === 'pg_dump') writeFileSync(args.at(-1)!, 'x'.repeat(120));
        }),
        log: vi.fn(), error: vi.fn(),
    } satisfies ReleaseBackupCliDependencies;
    return { backupDir, dependencies };
}

describe('release backup CLI', () => {
    it('creates and verifies every custom-format dump without logging URLs', async () => {
        const { backupDir, dependencies } = setup();
        expect(await runReleaseBackupCli(dependencies)).toBe(0);
        expect(dependencies.execute.mock.calls.map(([file]) => file)).toEqual([
            'pg_dump', 'pg_restore', 'pg_dump', 'pg_restore',
        ]);
        expect(dependencies.execute.mock.calls[1][1][0]).toBe('--list');
        expect(readFileSync(join(backupDir, 'release_20260102030405_1.dump'), 'utf8')).toHaveLength(120);
        expect(JSON.stringify([dependencies.log.mock.calls, dependencies.error.mock.calls]))
            .not.toContain('postgresql://');
    });

    it('removes an unreadable dump and fails closed', async () => {
        const { backupDir, dependencies } = setup();
        dependencies.execute.mockImplementation(async (file, args) => {
            if (file === 'pg_dump') writeFileSync(args.at(-1)!, 'x'.repeat(120));
            if (file === 'pg_restore') throw new Error('synthetic verify failure');
        });
        expect(await runReleaseBackupCli(dependencies)).toBe(1);
        expect(() => readFileSync(join(backupDir, 'release_20260102030405_1.dump'))).toThrow();
        expect(dependencies.error).toHaveBeenCalledWith('[database #1] BACKUP_VERIFY_FAILED');
    });
});
