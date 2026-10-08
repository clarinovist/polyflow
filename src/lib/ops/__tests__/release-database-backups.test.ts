import { describe, expect, it, vi } from 'vitest';
import { backupReleaseDatabases, ReleaseBackupError } from '../release-database-backups';

const main = 'postgresql://synthetic:secret@db.invalid/main';
const first = 'postgresql://synthetic:secret@db.invalid/first';
const second = 'postgresql://synthetic:secret@db.invalid/second';

function setup(urls: Array<string | null> = [first, second]) {
    const registry = {
        tenant: { findMany: vi.fn().mockResolvedValue(urls.map((dbUrl) => ({ dbUrl }))) },
        $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const dependencies = {
        mainDatabaseUrl: main, createRegistry: vi.fn(() => registry),
        backup: vi.fn<(url: string, ordinal: number) => Promise<void>>().mockResolvedValue(undefined),
    };
    return { registry, dependencies };
}

describe('release database backup core', () => {
    it('backs up main and every unique active tenant sequentially', async () => {
        const aliasOfMain = 'postgresql://other:credential@db.invalid/main?schema=public';
        const { registry, dependencies } = setup([first, aliasOfMain, second]);
        const events: string[] = [];
        dependencies.backup.mockImplementation(async (_url, ordinal) => { events.push('backup:' + ordinal); });
        expect(await backupReleaseDatabases(dependencies)).toEqual({ selected: 3, backedUp: 3, failures: [] });
        expect(dependencies.backup.mock.calls.map(([url]) => url)).toEqual([main, first, second]);
        expect(events).toEqual(['backup:1', 'backup:2', 'backup:3']);
        expect(registry.$disconnect).toHaveBeenCalledOnce();
    });

    it('validates every target before creating any backup', async () => {
        const { dependencies } = setup([first, null]);
        const result = await backupReleaseDatabases(dependencies);
        expect(result.failures).toEqual([{ category: 'MISSING_DATABASE_URL', databaseNumber: 3 }]);
        expect(dependencies.backup).not.toHaveBeenCalled();
    });

    it('stops at the first backup or verification failure', async () => {
        const { dependencies } = setup();
        dependencies.backup.mockRejectedValueOnce(new ReleaseBackupError('BACKUP_VERIFY_FAILED'));
        expect(await backupReleaseDatabases(dependencies)).toEqual({
            selected: 3, backedUp: 0, failures: [{ category: 'BACKUP_VERIFY_FAILED', databaseNumber: 1 }],
        });
        expect(dependencies.backup).toHaveBeenCalledOnce();
    });

    it('fails closed and sanitizes registry failures', async () => {
        const { registry, dependencies } = setup();
        registry.tenant.findMany.mockRejectedValue(new Error(first));
        registry.$disconnect.mockRejectedValue(new Error(second));
        expect(await backupReleaseDatabases(dependencies)).toEqual({
            selected: 0, backedUp: 0, failures: [
                { category: 'REGISTRY_QUERY_FAILED' },
                { category: 'REGISTRY_DISCONNECT_FAILED' },
            ],
        });
        expect(dependencies.backup).not.toHaveBeenCalled();
    });
});
