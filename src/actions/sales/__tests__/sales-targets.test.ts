import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: vi.fn().mockResolvedValue({
        user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
    }),
    requireSalesManager: vi.fn().mockResolvedValue({
        user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
    }),
}));

vi.mock('@/services/sales/field-scope', () => ({
    getFieldSalesScope: vi.fn().mockReturnValue({ actorUserId: 'admin', isGlobalViewer: true }),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', async () => {
    const actual = (await vi.importActual('@/lib/errors/errors')) as any;
    return {
        ...actual,
        safeAction: async (fn: () => Promise<unknown>) => {
            try {
                const data = await fn();
                return { success: true, data };
            } catch (e) {
                return { success: false, error: (e as Error).message };
            }
        },
    };
});

vi.mock('@/services/sales/target-service', () => ({
    upsertTarget: vi.fn().mockResolvedValue({ id: 't1' }),
    bulkSetTargets: vi.fn().mockResolvedValue({ successes: [{ target: { id: 't1' } }], failures: [] }),
    copyTargetsFromPreviousMonth: vi.fn().mockResolvedValue({ created: 2, skipped: 0, skippedUserIds: [], errors: [] }),
    getTargetsForPeriod: vi.fn().mockResolvedValue([]),
}));

import {
    upsertTargetAction,
    bulkSetTargetsAction,
    copyTargetsFromPreviousMonthAction,
    getTargetsForPeriodAction,
} from '../sales-targets';
import { requireSalesAccess, requireSalesManager } from '@/lib/auth/sales-access';
import { getFieldSalesScope } from '@/services/sales/field-scope';
import {
    copyTargetsFromPreviousMonth as svcCopy,
    getTargetsForPeriod as svcGetTargets,
} from '@/services/sales/target-service';

describe('sales-targets actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireSalesAccess).mockResolvedValue({
            user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
        } as any);
        vi.mocked(requireSalesManager).mockResolvedValue({
            user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
        } as any);
        vi.mocked(getFieldSalesScope).mockReturnValue({
            actorUserId: 'admin',
            isGlobalViewer: true,
        });
        vi.mocked(svcGetTargets).mockResolvedValue([] as never);
    });

    describe('write guards: SALES ditolak, ADMIN/MARKETING lolos', () => {
        it('upsertTargetAction allows ADMIN', async () => {
            const res = await upsertTargetAction({
                userId: 'u-sales-1',
                periodYear: 2026,
                periodMonth: 8,
                revenueTarget: 1000000,
            });
            expect(res!.success).toBe(true);
            expect(requireSalesManager).toHaveBeenCalled();
        });

        it('upsertTargetAction allows MARKETING', async () => {
            vi.mocked(requireSalesManager).mockResolvedValue({
                user: { id: 'mkt-1', role: 'MARKETING', roles: ['MARKETING'] },
            } as any);
            const res = await upsertTargetAction({
                userId: 'u-sales-1',
                periodYear: 2026,
                periodMonth: 8,
                revenueTarget: 500000,
            });
            expect(res!.success).toBe(true);
        });

        it('upsertTargetAction rejects SALES (manager guard)', async () => {
            vi.mocked(requireSalesManager).mockRejectedValue(
                new Error('Unauthorized: Hanya admin atau marketing'),
            );
            const res = await upsertTargetAction({
                userId: 'u-sales-1',
                periodYear: 2026,
                periodMonth: 8,
                revenueTarget: 500000,
            });
            expect(res!.success).toBe(false);
        });

        it('bulkSetTargetsAction allows ADMIN', async () => {
            const res = await bulkSetTargetsAction(
                [
                    { userId: 'u-1', revenueTarget: 100 } as any,
                    { userId: 'u-2', revenueTarget: 200 } as any,
                ],
                2026,
                8,
            );
            expect(res!.success).toBe(true);
            expect(requireSalesManager).toHaveBeenCalled();
        });

        it('bulkSetTargetsAction rejects SALES', async () => {
            vi.mocked(requireSalesManager).mockRejectedValue(
                new Error('Unauthorized: Hanya admin atau marketing'),
            );
            const res = await bulkSetTargetsAction(
                [{ userId: 'u-1', revenueTarget: 100 } as any],
                2026,
                8,
            );
            expect(res!.success).toBe(false);
        });

        it('copyTargetsFromPreviousMonthAction allows ADMIN', async () => {
            const res = await copyTargetsFromPreviousMonthAction(2026, 8);
            expect(res!.success).toBe(true);
            expect(svcCopy).toHaveBeenCalledWith(2026, 8, 'admin');
        });

        it('copyTargetsFromPreviousMonthAction rejects SALES', async () => {
            vi.mocked(requireSalesManager).mockRejectedValue(
                new Error('Unauthorized: Hanya admin atau marketing'),
            );
            const res = await copyTargetsFromPreviousMonthAction(2026, 8);
            expect(res!.success).toBe(false);
        });
    });

    describe('read guard: requireSalesAccess allows ADMIN/SALES/MARKETING', () => {
        it('getTargetsForPeriodAction allows SALES to see own only (scoped)', async () => {
            // SALES user calling
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'sales-a', role: 'SALES', roles: ['SALES'] },
            } as any);
            vi.mocked(getFieldSalesScope).mockReturnValue({
                actorUserId: 'sales-a',
                isGlobalViewer: false,
            });
            vi.mocked(svcGetTargets).mockResolvedValue([
                {
                    id: 't1',
                    userId: 'sales-a',
                    periodYear: 2026,
                    periodMonth: 8,
                    revenueTarget: new Decimal(1000),
                    visitTarget: 10,
                    orderTarget: null,
                    notes: null,
                    createdById: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    userName: 'Sales A',
                    revenueActual: new Decimal(500),
                    revenueAchievementPercent: 50,
                    visitActual: 5,
                    visitAchievementPercent: 50,
                } as never,
                {
                    id: 't2',
                    userId: 'sales-b',
                    periodYear: 2026,
                    periodMonth: 8,
                    revenueTarget: new Decimal(2000),
                    visitTarget: 10,
                    orderTarget: null,
                    notes: null,
                    createdById: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    userName: 'Sales B',
                    revenueActual: new Decimal(100),
                    revenueAchievementPercent: 5,
                    visitActual: 1,
                    visitAchievementPercent: 10,
                } as never,
            ]);

            const res = await getTargetsForPeriodAction(2026, 8);
            expect(res!.success).toBe(true);
            const data = (res as { data: { userId: string }[] }).data;
            // hanya milik sales-a
            expect(data).toHaveLength(1);
            expect(data[0].userId).toBe('sales-a');
        });

        it('getTargetsForPeriodAction ADMIN sees all (global viewer)', async () => {
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
            } as any);
            vi.mocked(getFieldSalesScope).mockReturnValue({
                actorUserId: 'admin',
                isGlobalViewer: true,
            });
            vi.mocked(svcGetTargets).mockResolvedValue([
                { id: 't1', userId: 'sales-a', periodYear: 2026, periodMonth: 8 } as never,
                { id: 't2', userId: 'sales-b', periodYear: 2026, periodMonth: 8 } as never,
            ] as never);

            const res = await getTargetsForPeriodAction(2026, 8);
            expect(res!.success).toBe(true);
            const data = (res as { data: { userId: string }[] }).data;
            expect(data).toHaveLength(2);
        });

        it('getTargetsForPeriodAction MARKETING sees all (global viewer)', async () => {
            vi.mocked(requireSalesAccess).mockResolvedValue({
                user: { id: 'mkt-1', role: 'MARKETING', roles: ['MARKETING'] },
            } as any);
            vi.mocked(getFieldSalesScope).mockReturnValue({
                actorUserId: 'mkt-1',
                isGlobalViewer: true,
            });
            vi.mocked(svcGetTargets).mockResolvedValue([
                { id: 't1', userId: 'sales-a' } as never,
            ] as never);

            const res = await getTargetsForPeriodAction(2026, 8);
            expect(res!.success).toBe(true);
            const data = (res as { data: unknown[] }).data;
            expect(data).toHaveLength(1);
        });

        it('getTargetsForPeriodAction rejects unauthorized (no session)', async () => {
            vi.mocked(requireSalesAccess).mockRejectedValue(new Error('Unauthorized'));
            const res = await getTargetsForPeriodAction(2026, 8);
            expect(res!.success).toBe(false);
        });
    });

    describe('validation', () => {
        it('upsertTargetAction rejects when revenueTarget missing', async () => {
            const res = await upsertTargetAction({
                userId: 'u-1',
                periodYear: 2026,
                periodMonth: 8,
            } as any);
            // validation inside action returns failure via safeAction
            expect(res!.success).toBe(false);
        });

        it('bulk action rejects when empty items', async () => {
            const res = await bulkSetTargetsAction([] as any, 2026, 8);
            expect(res!.success).toBe(false);
        });
    });
});
