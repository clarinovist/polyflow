import { describe, expect, it, vi } from 'vitest';
import {
    migrateAllTenants,
    MigrationCommandError,
    type TenantMigrationRegistry,
} from '../tenant-migrations';

const firstUrl = 'postgresql://synthetic:secret@db.invalid:5432/first';
const secondUrl = 'postgres://synthetic:secret@db.invalid:5432/second';

function setup(urls: Array<string | null> = [firstUrl, secondUrl]) {
    const registry = {
        tenant: { findMany: vi.fn().mockResolvedValue(urls.map((dbUrl) => ({ dbUrl }))) },
        $disconnect: vi.fn().mockResolvedValue(undefined),
    } satisfies TenantMigrationRegistry;
    const dependencies = {
        createRegistry: vi.fn(() => registry),
        migrate: vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined),
    };
    return { registry, dependencies };
}

describe('tenant migration core', () => {
    it('selects only ACTIVE tenant URLs, migrates sequentially and disconnects last', async () => {
        const { registry, dependencies } = setup();
        const events: string[] = [];
        dependencies.migrate.mockImplementation(async (url) => {
            events.push(`start:${url}`);
            await Promise.resolve();
            events.push(`end:${url}`);
        });
        registry.$disconnect.mockImplementation(async () => { events.push('disconnect'); });

        expect(await migrateAllTenants(dependencies)).toEqual({
            selected: 2, attempted: 2, migrated: 2, failures: [],
        });
        expect(registry.tenant.findMany).toHaveBeenCalledExactlyOnceWith({
            where: { status: 'ACTIVE' }, select: { dbUrl: true },
        });
        expect(events).toEqual([
            `start:${firstUrl}`, `end:${firstUrl}`,
            `start:${secondUrl}`, `end:${secondUrl}`, 'disconnect',
        ]);
        expect(registry.$disconnect).toHaveBeenCalledTimes(1);
    });

    it('disconnects normally with no active tenants', async () => {
        const { registry, dependencies } = setup([]);
        expect(await migrateAllTenants(dependencies)).toEqual({
            selected: 0, attempted: 0, migrated: 0, failures: [],
        });
        expect(dependencies.migrate).not.toHaveBeenCalled();
        expect(registry.$disconnect).toHaveBeenCalledTimes(1);
    });

    it('aggregates migration failures while attempting later tenants', async () => {
        const { registry, dependencies } = setup([firstUrl, secondUrl, firstUrl]);
        dependencies.migrate
            .mockRejectedValueOnce(new Error(`sensitive: ${firstUrl}`))
            .mockRejectedValueOnce(new MigrationCommandError('MIGRATION_INTERRUPTED'));
        const result = await migrateAllTenants(dependencies);
        expect(result).toEqual({
            selected: 3, attempted: 3, migrated: 1,
            failures: [
                { category: 'MIGRATION_FAILED', tenantNumber: 1 },
                { category: 'MIGRATION_INTERRUPTED', tenantNumber: 2 },
            ],
        });
        expect(dependencies.migrate).toHaveBeenCalledTimes(3);
        expect(registry.$disconnect).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).not.toContain(firstUrl);
    });

    it.each([
        [null, 'MISSING_DATABASE_URL'],
        [undefined, 'MISSING_DATABASE_URL'],
        ['', 'MISSING_DATABASE_URL'],
        [' \t ', 'MISSING_DATABASE_URL'],
        [42, 'INVALID_DATABASE_URL'],
        ['not a URL', 'INVALID_DATABASE_URL'],
        ['https://db.invalid/tenant', 'INVALID_DATABASE_URL'],
        ['postgresql:///tenant', 'INVALID_DATABASE_URL'],
        ['postgresql://db.invalid', 'INVALID_DATABASE_URL'],
        ['postgresql://db.invalid/', 'INVALID_DATABASE_URL'],
        ['postgresql://db.invalid:abc/tenant', 'INVALID_DATABASE_URL'],
        ['postgresql://db.invalid:65536/tenant', 'INVALID_DATABASE_URL'],
        ['postgresql://db.invalid:0/tenant', 'INVALID_DATABASE_URL'],
        ['postgresql://db.invalid/tenant#fragment', 'INVALID_DATABASE_URL'],
        ['postgresql://user:bad%password@db.invalid/tenant', 'INVALID_DATABASE_URL'],
        [` ${firstUrl}`, 'INVALID_DATABASE_URL'],
        [`${firstUrl}\n`, 'INVALID_DATABASE_URL'],
        [`${firstUrl}\u0000`, 'INVALID_DATABASE_URL'],
    ])('rejects invalid/missing URL %# without migration and continues', async (url, category) => {
        const { registry, dependencies } = setup([url as string | null, secondUrl]);
        const result = await migrateAllTenants(dependencies);
        expect(result).toEqual({
            selected: 2, attempted: 1, migrated: 1,
            failures: [{ category, tenantNumber: 1 }],
        });
        expect(dependencies.migrate).toHaveBeenCalledExactlyOnceWith(secondUrl);
        expect(registry.$disconnect).toHaveBeenCalledTimes(1);
    });

    it('preserves shell metacharacters and encoded URL bytes', async () => {
        const url = 'postgresql://user:pa"ss$(noop);`noop`&%25@db.invalid/tenant?schema=public&x=%22';
        const { dependencies } = setup([url]);
        expect((await migrateAllTenants(dependencies)).failures).toEqual([]);
        expect(dependencies.migrate).toHaveBeenCalledExactlyOnceWith(url);
    });

    it('records factory failure without opening or migrating another connection', async () => {
        const { registry, dependencies } = setup();
        dependencies.createRegistry.mockImplementation(() => { throw new Error(firstUrl); });
        expect(await migrateAllTenants(dependencies)).toEqual({
            selected: 0, attempted: 0, migrated: 0,
            failures: [{ category: 'REGISTRY_INIT_FAILED' }],
        });
        expect(registry.tenant.findMany).not.toHaveBeenCalled();
        expect(registry.$disconnect).not.toHaveBeenCalled();
        expect(dependencies.migrate).not.toHaveBeenCalled();
    });

    it('disconnects after a registry query failure and sanitizes both failures', async () => {
        const { registry, dependencies } = setup();
        registry.tenant.findMany.mockRejectedValue(new Error(firstUrl));
        registry.$disconnect.mockRejectedValue(new Error(secondUrl));
        expect(await migrateAllTenants(dependencies)).toEqual({
            selected: 0, attempted: 0, migrated: 0,
            failures: [
                { category: 'REGISTRY_QUERY_FAILED' },
                { category: 'REGISTRY_DISCONNECT_FAILED' },
            ],
        });
        expect(dependencies.migrate).not.toHaveBeenCalled();
        expect(registry.$disconnect).toHaveBeenCalledTimes(1);
    });

    it.each([{ urls: [] }, { urls: [firstUrl] }])('records disconnect failure after otherwise successful work %#', async ({ urls }) => {
        const { registry, dependencies } = setup(urls);
        registry.$disconnect.mockRejectedValue(new Error(firstUrl));
        const result = await migrateAllTenants(dependencies);
        expect(result.migrated).toBe(urls.length);
        expect(result.failures).toEqual([{ category: 'REGISTRY_DISCONNECT_FAILED' }]);
    });

    it('retains a migration failure when disconnect also fails', async () => {
        const { registry, dependencies } = setup([firstUrl]);
        dependencies.migrate.mockRejectedValue(new MigrationCommandError('MIGRATION_LAUNCH_FAILED'));
        registry.$disconnect.mockRejectedValue(new Error(firstUrl));
        expect((await migrateAllTenants(dependencies)).failures).toEqual([
            { category: 'MIGRATION_LAUNCH_FAILED', tenantNumber: 1 },
            { category: 'REGISTRY_DISCONNECT_FAILED' },
        ]);
    });
});
