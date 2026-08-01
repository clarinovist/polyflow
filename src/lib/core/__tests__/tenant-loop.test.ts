import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runForEachActiveTenant } from '../tenant-loop';

const mockFindMany = vi.fn();

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: () => ({
        tenant: { findMany: mockFindMany },
    }),
    getTenantDb: vi.fn().mockReturnValue({}),
    tenantContext: {
        run: vi.fn().mockImplementation((_store: any, fn: any) => fn()),
    },
    tenantIdContext: {
        run: vi.fn().mockImplementation((_store: any, fn: any) => fn()),
    },
}));

vi.mock('@/lib/core/actor-context', () => ({
    actorContext: {
        run: vi.fn().mockImplementation((_store: any, fn: any) => fn()),
    },
}));

describe('runForEachActiveTenant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('runs fn for each ACTIVE tenant and returns results', async () => {
        mockFindMany.mockResolvedValue([
            { id: 't1', subdomain: 'kiyowo', dbUrl: 'postgres://kiyowo' },
            { id: 't2', subdomain: 'melindo', dbUrl: 'postgres://melindo' },
        ]);

        const results = await runForEachActiveTenant(async (tenant) => {
            return `done-${tenant.subdomain}`;
        });

        expect(results).toEqual([
            { tenant: 'kiyowo', result: 'done-kiyowo' },
            { tenant: 'melindo', result: 'done-melindo' },
        ]);
    });

    it('queries only ACTIVE tenants', async () => {
        mockFindMany.mockResolvedValue([
            { id: 't1', subdomain: 'kiyowo', dbUrl: 'postgres://kiyowo' },
        ]);

        await runForEachActiveTenant(async () => 'ok');

        expect(mockFindMany).toHaveBeenCalledWith({
            where: { status: 'ACTIVE' },
        });
    });

    it('does not cancel remaining tenants when one errors', async () => {
        mockFindMany.mockResolvedValue([
            { id: 't1', subdomain: 'kiyowo', dbUrl: 'postgres://kiyowo' },
            { id: 't2', subdomain: 'melindo', dbUrl: 'postgres://melindo' },
        ]);

        const fn = vi.fn()
            .mockImplementationOnce(() => {
                throw new Error('kiyowo failed');
            })
            .mockImplementationOnce(async () => 'melindo-ok');

        const results = await runForEachActiveTenant(fn);

        expect(results).toEqual([
            { tenant: 'kiyowo', error: 'kiyowo failed' },
            { tenant: 'melindo', result: 'melindo-ok' },
        ]);
    });

    it('sets actorContext store to { userId: "system" }', async () => {
        const { actorContext } = await import('@/lib/core/actor-context');
        const actorContextRun = actorContext.run as any;

        mockFindMany.mockResolvedValue([
            { id: 't1', subdomain: 'kiyowo', dbUrl: 'postgres://kiyowo' },
        ]);

        await runForEachActiveTenant(async () => 'ok');

        expect(actorContextRun).toHaveBeenCalledTimes(1);
        const actorStore = actorContextRun.mock.calls[0][0];
        expect(actorStore).toEqual({ userId: 'system' });
    });

    it('returns empty array when no ACTIVE tenants', async () => {
        mockFindMany.mockResolvedValue([]);

        const results = await runForEachActiveTenant(async () => 'ok');

        expect(results).toEqual([]);
    });

    it('handles non-Error thrown values', async () => {
        mockFindMany.mockResolvedValue([
            { id: 't1', subdomain: 'kiyowo', dbUrl: 'postgres://kiyowo' },
        ]);

        const results = await runForEachActiveTenant(async () => {
            throw 'string error';
        });

        expect(results).toEqual([
            { tenant: 'kiyowo', error: 'string error' },
        ]);
    });
});
