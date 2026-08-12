import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanupOldPerformanceMetrics } from '../performance-metrics-cleanup.service';
import { prisma, getTenantDb } from '@/lib/core/prisma';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        tenant: { findMany: vi.fn() },
        performanceMetric: { deleteMany: vi.fn() },
    },
    getTenantDb: vi.fn(),
}));

const mockGetTenantDb = vi.mocked(getTenantDb);

function makeMockTenantDb(deletedCount: number) {
    return {
        performanceMetric: {
            deleteMany: vi.fn().mockResolvedValue({ count: deletedCount }),
        },
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
            { id: 't1', name: 'Tenant A', dbUrl: 'postgres://a' },
            { id: 't2', name: 'Tenant B', dbUrl: 'postgres://b' },
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
            { id: 't1', name: 'Tenant A', dbUrl: 'postgres://a' },
            { id: 't2', name: 'Tenant B', dbUrl: 'postgres://b' },
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
            error: 'connection refused',
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
