import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPerformanceMetricsSummary } from '../performance-metrics';
import { prisma, getTenantDb } from '@/lib/core/prisma';
import { auth } from '@/auth';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        tenant: { findMany: vi.fn() },
    },
    getTenantDb: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

const mockAuth = vi.mocked(auth);
const mockGetTenantDb = vi.mocked(getTenantDb);

function makeMockTenantDb(samples: { durationMs: number; createdAt: Date }[]) {
    return {
        performanceMetric: {
            findMany: vi.fn().mockResolvedValue(samples),
        },
    };
}

describe('getPerformanceMetricsSummary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuth.mockResolvedValue({
            user: { isSuperAdmin: true },
        } as never);
    });

    it('throws AuthorizationError when caller is not a super admin', async () => {
        mockAuth.mockResolvedValue({ user: { isSuperAdmin: false } } as never);

        await expect(
            getPerformanceMetricsSummary('production-orders-list'),
        ).rejects.toThrow('Super Admin access required.');
    });

    it('throws AuthorizationError when there is no session', async () => {
        mockAuth.mockResolvedValue(null as never);

        await expect(
            getPerformanceMetricsSummary('production-orders-list'),
        ).rejects.toThrow('Super Admin access required.');
    });

    it('returns zeroed summary with null stats when a tenant has no samples', async () => {
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([
            { id: 't1', name: 'Tenant A', dbUrl: 'postgres://a' },
        ] as never);
        mockGetTenantDb.mockReturnValue(makeMockTenantDb([]) as never);

        const [summary] = await getPerformanceMetricsSummary(
            'production-orders-list',
        );

        expect(summary).toEqual({
            tenantId: 't1',
            tenantName: 'Tenant A',
            online: true,
            count: 0,
            avgMs: null,
            p95Ms: null,
            maxMs: null,
            lastAt: null,
        });
    });

    it('computes count/avg/p95/max and lastAt from samples', async () => {
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([
            { id: 't1', name: 'Tenant A', dbUrl: 'postgres://a' },
        ] as never);
        const durations = [10, 20, 30, 40, 100];
        mockGetTenantDb.mockReturnValue(
            makeMockTenantDb(
                durations.map((durationMs, i) => ({
                    durationMs,
                    createdAt: new Date(2026, 7, 12, 0, i),
                })),
            ) as never,
        );

        const [summary] = await getPerformanceMetricsSummary(
            'production-orders-list',
        );

        expect(summary.count).toBe(5);
        expect(summary.avgMs).toBe(40); // (10+20+30+40+100)/5 = 40
        expect(summary.p95Ms).toBe(100);
        expect(summary.maxMs).toBe(100);
        expect(summary.lastAt).toBe(new Date(2026, 7, 12, 0, 0).toISOString());
    });

    it('marks a tenant offline without failing the whole batch when its DB is unreachable', async () => {
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([
            { id: 't1', name: 'Tenant A', dbUrl: 'postgres://a' },
            { id: 't2', name: 'Tenant B', dbUrl: 'postgres://b' },
        ] as never);
        mockGetTenantDb.mockImplementation((dbUrl: string) => {
            if (dbUrl === 'postgres://a') {
                return {
                    performanceMetric: {
                        findMany: vi
                            .fn()
                            .mockRejectedValue(new Error('connect timeout')),
                    },
                } as never;
            }
            return makeMockTenantDb([]) as never;
        });

        const results = await getPerformanceMetricsSummary(
            'production-orders-list',
        );

        expect(results).toHaveLength(2);
        expect(results[0]).toMatchObject({
            tenantId: 't1',
            online: false,
            error: 'connect timeout',
        });
        expect(results[1]).toMatchObject({ tenantId: 't2', online: true });
    });

    it('treats a tenant with no dbUrl configured as offline', async () => {
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([
            { id: 't1', name: 'Tenant A', dbUrl: '' },
        ] as never);

        const [summary] = await getPerformanceMetricsSummary(
            'production-orders-list',
        );

        expect(summary).toMatchObject({
            online: false,
            error: 'No database URL configured',
        });
        expect(mockGetTenantDb).not.toHaveBeenCalled();
    });
});
