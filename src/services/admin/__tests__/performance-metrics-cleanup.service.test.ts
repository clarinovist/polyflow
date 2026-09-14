import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupOldPerformanceMetrics } from '../performance-metrics-cleanup.service';
import { prisma, getMainPrisma, getTenantDb } from '@/lib/core/prisma';

vi.mock('@/lib/core/prisma', () => {
    const main = {
        tenant: { findMany: vi.fn() },
        performanceMetric: { deleteMany: vi.fn() },
        $disconnect: vi.fn(),
    };
    return {
        prisma: main,
        getMainPrisma: vi.fn(() => main),
        getTenantDb: vi.fn(),
    };
});

const mockGetTenantDb = vi.mocked(getTenantDb);

function makeMockTenantDb(deletedCount: number) {
    return {
        performanceMetric: {
            deleteMany: vi.fn().mockResolvedValue({ count: deletedCount }),
        },
        $disconnect: vi.fn(),
    };
}

describe('cleanupOldPerformanceMetrics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('deletes rows older than the retention window from the main DB and every active tenant', async () => {
        vi.mocked(prisma.performanceMetric.deleteMany).mockResolvedValue({
            count: 12,
        } as never);
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([
            { id: 't1', name: 'Tenant A', dbUrl: 'postgres://a/metrics' },
            { id: 't2', name: 'Tenant B', dbUrl: 'postgres://b/metrics' },
        ] as never);
        mockGetTenantDb
            .mockReturnValueOnce(makeMockTenantDb(3) as never)
            .mockReturnValueOnce(makeMockTenantDb(5) as never);

        const results = await cleanupOldPerformanceMetrics(30);

        expect(results).toEqual([
            {
                tenantId: 'main',
                tenantName: 'polyflow (main)',
                online: true,
                deletedCount: 12,
            },
            {
                tenantId: 't1',
                tenantName: 'Tenant A',
                online: true,
                deletedCount: 3,
            },
            {
                tenantId: 't2',
                tenantName: 'Tenant B',
                online: true,
                deletedCount: 5,
            },
        ]);
        expect(prisma.tenant.findMany).toHaveBeenCalledWith({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, dbUrl: true },
        });
    });

    it('uses a cutoff date matching the requested retention window', async () => {
        vi.mocked(prisma.performanceMetric.deleteMany).mockResolvedValue({
            count: 0,
        } as never);
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([]);

        const before = Date.now();
        await cleanupOldPerformanceMetrics(7);
        const after = Date.now();

        const call = vi.mocked(prisma.performanceMetric.deleteMany).mock
            .calls[0][0] as { where: { createdAt: { lt: Date } } };
        const cutoffMs = call.where.createdAt.lt.getTime();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

        expect(cutoffMs).toBeGreaterThanOrEqual(before - sevenDaysMs - 1000);
        expect(cutoffMs).toBeLessThanOrEqual(after - sevenDaysMs + 1000);
    });

    it('defaults to the 30-day retention window when no argument is passed', async () => {
        vi.mocked(prisma.performanceMetric.deleteMany).mockResolvedValue({
            count: 0,
        } as never);
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([]);

        await cleanupOldPerformanceMetrics();

        const call = vi.mocked(prisma.performanceMetric.deleteMany).mock
            .calls[0][0] as { where: { createdAt: { lt: Date } } };
        const cutoffMs = call.where.createdAt.lt.getTime();
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

        expect(Math.abs(cutoffMs - thirtyDaysAgo)).toBeLessThan(5000);
    });

    it('marks a tenant offline when its DB is unreachable, without failing other tenants', async () => {
        vi.mocked(prisma.performanceMetric.deleteMany).mockResolvedValue({
            count: 0,
        } as never);
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([
            { id: 't1', name: 'Tenant A', dbUrl: 'postgres://a/metrics' },
            { id: 't2', name: 'Tenant B', dbUrl: 'postgres://b/metrics' },
        ] as never);
        mockGetTenantDb
            .mockReturnValueOnce({
                performanceMetric: {
                    deleteMany: vi
                        .fn()
                        .mockRejectedValue(new Error('connection refused')),
                },
            } as never)
            .mockReturnValueOnce(makeMockTenantDb(2) as never);

        const results = await cleanupOldPerformanceMetrics(30);

        expect(results[1]).toEqual({
            tenantId: 't1',
            tenantName: 'Tenant A',
            online: false,
            error: 'Performance metric deletion failed',
            deletedCount: 0,
        });
        expect(results[2]).toEqual({
            tenantId: 't2',
            tenantName: 'Tenant B',
            online: true,
            deletedCount: 2,
        });
    });

    it('marks a tenant offline when it has no dbUrl configured', async () => {
        vi.mocked(prisma.performanceMetric.deleteMany).mockResolvedValue({
            count: 0,
        } as never);
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([
            { id: 't1', name: 'Tenant A', dbUrl: '' },
        ] as never);

        const results = await cleanupOldPerformanceMetrics(30);

        expect(results[1]).toEqual({
            tenantId: 't1',
            tenantName: 'Tenant A',
            online: false,
            error: 'No database URL configured',
            deletedCount: 0,
        });
        expect(mockGetTenantDb).not.toHaveBeenCalled();
    });

    it('uses the cached main client explicitly and never disconnects cached clients', async () => {
        const tenantDb = makeMockTenantDb(2);
        const main = {
            ...makeMockTenantDb(1),
            tenant: { findMany: vi.fn().mockResolvedValue([
                { id: 't1', name: 'Tenant A', dbUrl: 'postgres://a/metrics' },
            ]) },
        };
        vi.mocked(getMainPrisma).mockReturnValueOnce(main as never);
        mockGetTenantDb.mockReturnValueOnce(tenantDb as never);

        const results = await cleanupOldPerformanceMetrics();

        expect(results.map((result) => result.deletedCount)).toEqual([1, 2]);
        expect(getMainPrisma).toHaveBeenCalledOnce();
        expect(prisma.performanceMetric.deleteMany).not.toHaveBeenCalled();
        expect(prisma.tenant.findMany).not.toHaveBeenCalled();
        expect(prisma.$disconnect).not.toHaveBeenCalled();
        expect(main.$disconnect).not.toHaveBeenCalled();
        expect(tenantDb.$disconnect).not.toHaveBeenCalled();
    });

    it('rejects invalid retention before acquiring clients or deleting', async () => {
        await expect(cleanupOldPerformanceMetrics(0)).rejects.toThrow('Invalid retention period');
        expect(getMainPrisma).not.toHaveBeenCalled();
        expect(prisma.performanceMetric.deleteMany).not.toHaveBeenCalled();
        expect(mockGetTenantDb).not.toHaveBeenCalled();
    });

    it('sanitizes a main delete rejection and does not start tenant cleanup', async () => {
        vi.mocked(prisma.performanceMetric.deleteMany).mockRejectedValueOnce(new Error('secret raw detail'));

        await expect(cleanupOldPerformanceMetrics()).rejects.toThrow('Performance metric deletion failed');
        expect(prisma.tenant.findMany).not.toHaveBeenCalled();
        expect(prisma.$disconnect).not.toHaveBeenCalled();
    });

    it('sanitizes a registry rejection without releasing the cached main client', async () => {
        vi.mocked(prisma.performanceMetric.deleteMany).mockResolvedValueOnce({ count: 2 });
        vi.mocked(prisma.tenant.findMany).mockRejectedValueOnce(new Error('secret raw detail'));

        await expect(cleanupOldPerformanceMetrics()).rejects.toThrow('Tenant registry lookup failed');
        expect(mockGetTenantDb).not.toHaveBeenCalled();
        expect(prisma.$disconnect).not.toHaveBeenCalled();
    });

    it('sanitizes cached-client factory failures and continues to the next tenant', async () => {
        vi.mocked(prisma.performanceMetric.deleteMany).mockResolvedValueOnce({ count: 0 });
        vi.mocked(prisma.tenant.findMany).mockResolvedValueOnce([
            { id: 't1', name: 'Tenant A', dbUrl: 'postgres://a/metrics' },
            { id: 't2', name: 'Tenant B', dbUrl: 'postgres://b/metrics' },
        ] as never);
        mockGetTenantDb.mockImplementationOnce(() => { throw new Error('secret raw detail'); })
            .mockReturnValueOnce(makeMockTenantDb(4) as never);

        const results = await cleanupOldPerformanceMetrics();
        expect(results[1]).toMatchObject({ online: false, error: 'Database client creation failed' });
        expect(results[2]).toMatchObject({ online: true, deletedCount: 4 });
    });

    it('returns only the main DB result when there are no active tenants', async () => {
        vi.mocked(prisma.performanceMetric.deleteMany).mockResolvedValue({
            count: 4,
        } as never);
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([]);

        const results = await cleanupOldPerformanceMetrics(30);

        expect(results).toEqual([
            {
                tenantId: 'main',
                tenantName: 'polyflow (main)',
                online: true,
                deletedCount: 4,
            },
        ]);
    });
});
