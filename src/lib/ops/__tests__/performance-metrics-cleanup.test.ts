import { describe, expect, it, vi } from 'vitest';
import {
    runPerformanceMetricCleanup,
    type CleanupClientLease,
    type PerformanceMetricDb,
    type PerformanceMetricMainDb,
} from '../performance-metrics-cleanup';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const DAY = 86_400_000;
const rawError = new Error('sensitive connection exception');

function makeDb(count = 0) {
    return {
        performanceMetric: { deleteMany: vi.fn().mockResolvedValue({ count }) },
        $disconnect: vi.fn().mockResolvedValue(undefined),
    };
}

function owned<T extends { $disconnect: () => Promise<void> }>(db: T): CleanupClientLease<T> {
    return { db, ownership: 'owned', disconnect: () => db.$disconnect() };
}

function fixture() {
    const main = {
        ...makeDb(4),
        tenant: { findMany: vi.fn().mockResolvedValue([
            { id: 't1', name: 'Tenant A', dbUrl: 'postgres://a/metrics' },
            { id: 't2', name: 'Tenant B', dbUrl: 'postgresql://b/metrics' },
        ]) },
    };
    const first = makeDb(2);
    const second = makeDb(3);
    const dependencies = {
        now: vi.fn(() => NOW),
        acquireMain: vi.fn<() => CleanupClientLease<PerformanceMetricMainDb>>(() => owned(main)),
        acquireTenant: vi.fn<(url: string) => CleanupClientLease<PerformanceMetricDb>>()
            .mockReturnValueOnce(owned(first))
            .mockReturnValueOnce(owned(second)),
    };
    return { main, first, second, dependencies };
}

function expectNoRawError(report: unknown) {
    expect(JSON.stringify(report)).not.toContain(rawError.message);
    expect(JSON.stringify(report)).not.toContain('postgres://');
}

describe('runPerformanceMetricCleanup (real core)', () => {
    it('uses the default 30-day strict cutoff, ACTIVE selection, same cutoff and ordered results', async () => {
        const { main, first, second, dependencies } = fixture();
        const report = await runPerformanceMetricCleanup(dependencies);

        expect(report).toEqual({
            results: [
                { tenantId: 'main', tenantName: 'polyflow (main)', online: true, deletedCount: 4 },
                { tenantId: 't1', tenantName: 'Tenant A', online: true, deletedCount: 2 },
                { tenantId: 't2', tenantName: 'Tenant B', online: true, deletedCount: 3 },
            ],
            errors: [], totalDeleted: 9, hasFailure: false,
        });
        const query = { where: { createdAt: { lt: new Date(NOW.getTime() - 30 * DAY) } } };
        for (const db of [main, first, second]) {
            expect(db.performanceMetric.deleteMany).toHaveBeenCalledExactlyOnceWith(query);
            expect(db.$disconnect).toHaveBeenCalledOnce();
        }
        expect(dependencies.now).toHaveBeenCalledOnce();
        expect(main.tenant.findMany).toHaveBeenCalledExactlyOnceWith({
            where: { status: 'ACTIVE' }, select: { id: true, name: true, dbUrl: true },
        });
        expect(dependencies.acquireTenant.mock.calls).toEqual([['postgres://a/metrics'], ['postgresql://b/metrics']]);
        expect(main.performanceMetric.deleteMany.mock.invocationCallOrder[0])
            .toBeLessThan(main.tenant.findMany.mock.invocationCallOrder[0]);
        expect(first.$disconnect.mock.invocationCallOrder[0])
            .toBeLessThan(second.performanceMetric.deleteMany.mock.invocationCallOrder[0]);
        expect(second.$disconnect.mock.invocationCallOrder[0])
            .toBeLessThan(main.$disconnect.mock.invocationCallOrder[0]);
    });

    it('awaits a tenant release before acquiring the next (bounded sequential resources)', async () => {
        const { first, dependencies } = fixture();
        let release!: () => void;
        let reachedRelease!: () => void;
        const started = new Promise<void>((resolve) => { reachedRelease = resolve; });
        first.$disconnect.mockImplementationOnce(() => {
            reachedRelease();
            return new Promise<void>((resolve) => { release = resolve; });
        });
        const cleanup = runPerformanceMetricCleanup(dependencies);
        await started;
        expect(dependencies.acquireTenant).toHaveBeenCalledTimes(1);
        release();
        await cleanup;
        expect(dependencies.acquireTenant).toHaveBeenCalledTimes(2);
    });

    it('honors a custom positive fractional retention', async () => {
        const { main, dependencies } = fixture();
        await runPerformanceMetricCleanup(dependencies, 7.5);
        expect(main.performanceMetric.deleteMany).toHaveBeenCalledWith({
            where: { createdAt: { lt: new Date(NOW.getTime() - 7.5 * DAY) } },
        });
    });

    it('returns only main when no active tenants exist', async () => {
        const { main, dependencies } = fixture();
        main.tenant.findMany.mockResolvedValueOnce([]);
        const report = await runPerformanceMetricCleanup(dependencies);
        expect(report.results).toHaveLength(1);
        expect(report.hasFailure).toBe(false);
        expect(dependencies.acquireTenant).not.toHaveBeenCalled();
        expect(main.$disconnect).toHaveBeenCalledOnce();
    });

    it.each([0, -1, NaN, Infinity, -Infinity, Number.MAX_VALUE, Number.MIN_VALUE, 1e-10])(
        'rejects invalid/unsafe retention %s before acquiring clients or deleting', async (days) => {
            const { main, dependencies } = fixture();
            const report = await runPerformanceMetricCleanup(dependencies, days);
            expect(report).toEqual({ results: [], errors: ['Invalid retention period'], totalDeleted: 0, hasFailure: true });
            expect(dependencies.acquireMain).not.toHaveBeenCalled();
            expect(dependencies.acquireTenant).not.toHaveBeenCalled();
            expect(main.performanceMetric.deleteMany).not.toHaveBeenCalled();
        },
    );

    it('rejects an unrepresentable cutoff before acquiring clients', async () => {
        const { dependencies } = fixture();
        dependencies.now.mockReturnValueOnce(new Date(-8_640_000_000_000_000));
        const report = await runPerformanceMetricCleanup(dependencies);
        expect(report.errors).toEqual(['Invalid retention period']);
        expect(dependencies.acquireMain).not.toHaveBeenCalled();
    });

    it.each(['invalid', 'throws'])('fails closed if the injected clock %s', async (kind) => {
        const { dependencies } = fixture();
        dependencies.now.mockImplementationOnce(() => {
            if (kind === 'throws') throw rawError;
            return new Date(NaN);
        });
        const report = await runPerformanceMetricCleanup(dependencies);
        expect(report.errors).toEqual(['Invalid cleanup time']);
        expect(report.hasFailure).toBe(true);
        expect(dependencies.acquireMain).not.toHaveBeenCalled();
        expectNoRawError(report);
    });

    it('records a main factory failure without accessing any database', async () => {
        const { main, dependencies } = fixture();
        dependencies.acquireMain.mockImplementationOnce(() => { throw rawError; });
        const report = await runPerformanceMetricCleanup(dependencies);
        expect(report.results[0]).toMatchObject({ online: false, deletedCount: 0, error: 'Database client creation failed' });
        expect(report.hasFailure).toBe(true);
        expect(main.$disconnect).not.toHaveBeenCalled(); // no client was returned/owned
        expect(main.performanceMetric.deleteMany).not.toHaveBeenCalled();
        expect(dependencies.acquireTenant).not.toHaveBeenCalled();
        expectNoRawError(report);
    });

    it('stops before registry on main delete failure but releases main', async () => {
        const { main, dependencies } = fixture();
        main.performanceMetric.deleteMany.mockRejectedValueOnce(rawError);
        const report = await runPerformanceMetricCleanup(dependencies);
        expect(report.results[0]).toMatchObject({ online: false, error: 'Performance metric deletion failed' });
        expect(report.hasFailure).toBe(true);
        expect(main.tenant.findMany).not.toHaveBeenCalled();
        expect(dependencies.acquireTenant).not.toHaveBeenCalled();
        expect(main.$disconnect).toHaveBeenCalledOnce();
        expectNoRawError(report);
    });

    it('retains main deletion count and releases main on registry failure', async () => {
        const { main, dependencies } = fixture();
        main.tenant.findMany.mockRejectedValueOnce(rawError);
        const report = await runPerformanceMetricCleanup(dependencies);
        expect(report.results[0]).toMatchObject({ online: true, deletedCount: 4 });
        expect(report.errors).toEqual(['Tenant registry lookup failed']);
        expect(report.totalDeleted).toBe(4);
        expect(report.hasFailure).toBe(true);
        expect(dependencies.acquireTenant).not.toHaveBeenCalled();
        expect(main.$disconnect).toHaveBeenCalledOnce();
        expectNoRawError(report);
    });

    it.each([
        null, undefined, '', '   ', 'not-a-url', 'https://a', 'postgres://',
        'postgres://a bad', ' postgres://a', 'postgres://a', 'postgres://a/',
        'postgres://a/metrics#fragment', 'postgres://a:0/metrics',
        'postgres://a:65536/metrics', 'postgres://a:bad/metrics',
        'postgres://a/metrics%zz', 'postgres://a/metrics\u0000',
    ]) (
        'rejects missing/invalid URL %s without acquiring that client and continues', async (dbUrl) => {
            const { main, dependencies } = fixture();
            main.tenant.findMany.mockResolvedValueOnce([
                { id: 'bad', name: 'Missing DB', dbUrl },
                { id: 'good', name: 'Valid DB', dbUrl: 'postgres://valid/metrics' },
            ]);
            const report = await runPerformanceMetricCleanup(dependencies);
            expect(report.results[1]).toMatchObject({ online: false, deletedCount: 0 });
            expect(report.results[1].error).toBe(dbUrl == null || !dbUrl.trim()
                ? 'No database URL configured' : 'Invalid database URL');
            expect(report.results[2].online).toBe(true);
            expect(dependencies.acquireTenant).toHaveBeenCalledExactlyOnceWith('postgres://valid/metrics');
            expect(report.hasFailure).toBe(true);
            expect(main.$disconnect).toHaveBeenCalledOnce();
        },
    );

    it('passes a valid URL with shell characters opaquely to the tenant factory', async () => {
        const { main, dependencies } = fixture();
        const url = 'postgresql://synthetic:pa"ss$(noop);`noop`&%25@db.invalid/metrics';
        main.tenant.findMany.mockResolvedValueOnce([{ id: 't1', name: 'Tenant A', dbUrl: url }]);

        const report = await runPerformanceMetricCleanup(dependencies);

        expect(dependencies.acquireTenant).toHaveBeenCalledExactlyOnceWith(url);
        expect(report.hasFailure).toBe(false);
    });

    it('continues after tenant factory failure, releasing only returned clients', async () => {
        const { main, first, second, dependencies } = fixture();
        dependencies.acquireTenant.mockReset()
            .mockImplementationOnce(() => { throw rawError; })
            .mockReturnValueOnce(owned(second));
        const report = await runPerformanceMetricCleanup(dependencies);
        expect(report.results[1]).toMatchObject({ online: false, error: 'Database client creation failed' });
        expect(report.results[2]).toMatchObject({ online: true, deletedCount: 3 });
        expect(report.hasFailure).toBe(true);
        expect(first.$disconnect).not.toHaveBeenCalled();
        expect(second.$disconnect).toHaveBeenCalledOnce();
        expect(main.$disconnect).toHaveBeenCalledOnce();
        expectNoRawError(report);
    });

    it.each(['delete', 'disconnect', 'both'])('continues after tenant %s failure and preserves counts', async (kind) => {
        const { main, first, second, dependencies } = fixture();
        if (kind !== 'disconnect') first.performanceMetric.deleteMany.mockRejectedValueOnce(rawError);
        if (kind !== 'delete') first.$disconnect.mockRejectedValueOnce(rawError);
        const report = await runPerformanceMetricCleanup(dependencies);
        expect(report.results[1]).toEqual({
            tenantId: 't1', tenantName: 'Tenant A', online: false,
            deletedCount: kind === 'disconnect' ? 2 : 0,
            error: kind === 'both' ? 'Performance metric deletion failed; Database disconnect failed'
                : kind === 'delete' ? 'Performance metric deletion failed' : 'Database disconnect failed',
        });
        expect(report.results[2]).toMatchObject({ online: true, deletedCount: 3 });
        expect(report.totalDeleted).toBe(kind === 'disconnect' ? 9 : 7);
        expect(report.hasFailure).toBe(true);
        for (const db of [main, first, second]) expect(db.$disconnect).toHaveBeenCalledOnce();
        expectNoRawError(report);
    });

    it.each(['success', 'delete', 'registry'])('flags main disconnect failure after %s and keeps prior statuses/counts', async (kind) => {
        const { main, dependencies } = fixture();
        if (kind === 'delete') main.performanceMetric.deleteMany.mockRejectedValueOnce(rawError);
        if (kind === 'registry') main.tenant.findMany.mockRejectedValueOnce(rawError);
        main.$disconnect.mockRejectedValueOnce(rawError);
        const report = await runPerformanceMetricCleanup(dependencies);
        expect(report.results[0].online).toBe(false);
        expect(report.results[0].error).toContain('Database disconnect failed');
        expect(report.results[0].deletedCount).toBe(kind === 'delete' ? 0 : 4);
        expect(report.hasFailure).toBe(true);
        expect(main.$disconnect).toHaveBeenCalledOnce();
        expectNoRawError(report);
    });

    it('does not disconnect shared clients, even when their deletion fails', async () => {
        const { main, first, second, dependencies } = fixture();
        dependencies.acquireMain.mockReturnValueOnce({ db: main, ownership: 'shared' });
        dependencies.acquireTenant.mockReset()
            .mockReturnValueOnce({ db: first, ownership: 'shared' })
            .mockReturnValueOnce({ db: second, ownership: 'shared' });
        first.performanceMetric.deleteMany.mockRejectedValueOnce(rawError);
        const report = await runPerformanceMetricCleanup(dependencies);
        expect(report.hasFailure).toBe(true);
        expect(report.results[2].online).toBe(true);
        for (const db of [main, first, second]) expect(db.$disconnect).not.toHaveBeenCalled();
    });
});
