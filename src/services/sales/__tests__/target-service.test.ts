import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesTarget: {
            upsert: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(null),
        },
        salesOrder: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        salesReturn: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        salesVisit: {
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
        },
    },
}));

import { prisma } from '@/lib/core/prisma';
import {
    upsertTarget,
    bulkSetTargets,
    copyTargetsFromPreviousMonth,
    getTargetsForPeriod,
    getMyTarget,
    prevPeriod,
} from '../target-service';

describe('target-service', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('prevPeriod helper (Jan -> Des tahun lalu)', () => {
        it('Januari -> Desember tahun lalu', () => {
            expect(prevPeriod(2026, 1)).toEqual({ year: 2025, month: 12 });
        });
        it('Februari -> Januari tahun sama', () => {
            expect(prevPeriod(2026, 2)).toEqual({ year: 2026, month: 1 });
        });
        it('Desember -> November same year', () => {
            expect(prevPeriod(2026, 12)).toEqual({ year: 2026, month: 11 });
        });
    });

    describe('upsertTarget', () => {
        it('calls upsert with unique [userId, year, month]', async () => {
            const mockTarget = { id: 't1', userId: 'u1', periodYear: 2026, periodMonth: 8, revenueTarget: new Decimal(1000000) };
            vi.mocked(prisma.salesTarget.upsert).mockResolvedValue(mockTarget as never);

            const res = await upsertTarget({
                userId: 'u1',
                periodYear: 2026,
                periodMonth: 8,
                revenueTarget: 1000000,
                visitTarget: 10,
                createdById: 'admin1',
            });

            expect(prisma.salesTarget.upsert).toHaveBeenCalledOnce();
            const arg = vi.mocked(prisma.salesTarget.upsert).mock.calls[0][0] as any;
            expect(arg.where.userId_periodYear_periodMonth).toEqual({ userId: 'u1', periodYear: 2026, periodMonth: 8 });
            expect(res).toEqual(mockTarget);
        });

        it('validates periodMonth 1-12', async () => {
            await expect(upsertTarget({ userId: 'u1', periodYear: 2026, periodMonth: 13, revenueTarget: 100 } as never)).rejects.toThrow();
        });

        it('throws if userId missing', async () => {
            await expect(upsertTarget({ userId: '', periodYear: 2026, periodMonth: 1, revenueTarget: 100 } as never)).rejects.toThrow(/userId/);
        });

        it('accepts Decimal revenueTarget', async () => {
            vi.mocked(prisma.salesTarget.upsert).mockResolvedValue({ id: 't1' } as never);
            await upsertTarget({
                userId: 'u1',
                periodYear: 2026,
                periodMonth: 1,
                revenueTarget: new Decimal('12345.67'),
            });
            expect(prisma.salesTarget.upsert).toHaveBeenCalled();
        });
    });

    describe('bulkSetTargets — 1 sukses 1 gagal collected', () => {
        it('1 success 1 fail does not abort the other', async () => {
            vi.mocked(prisma.salesTarget.upsert)
                .mockResolvedValueOnce({ id: 't1', userId: 'u-good' } as never)
                .mockRejectedValueOnce(new Error('DB down for bad user'));

            const res = await bulkSetTargets([
                { userId: 'u-good', periodYear: 2026, periodMonth: 8, revenueTarget: 100 },
                { userId: 'u-bad', periodYear: 2026, periodMonth: 8, revenueTarget: 200 },
            ]);

            expect(res.successes).toHaveLength(1);
            expect(res.failures).toHaveLength(1);
            expect(res.successes[0].input.userId).toBe('u-good');
            expect(res.failures[0].input.userId).toBe('u-bad');
            expect(res.failures[0].error).toContain('DB down');
        });

        it('second invalid period captured as failure', async () => {
            vi.mocked(prisma.salesTarget.upsert).mockResolvedValue({ id: 't1' } as never);

            const res = await bulkSetTargets([
                { userId: 'u1', periodYear: 2026, periodMonth: 8, revenueTarget: 100 },
                { userId: 'u2', periodYear: 2026, periodMonth: 15, revenueTarget: 100 }, // invalid
            ]);

            expect(res.successes).toHaveLength(1);
            expect(res.failures).toHaveLength(1);
            expect(res.failures[0].input.userId).toBe('u2');
        });

        it('empty array returns empty results', async () => {
            const res = await bulkSetTargets([]);
            expect(res.successes).toHaveLength(0);
            expect(res.failures).toHaveLength(0);
        });
    });

    describe('copyTargetsFromPreviousMonth', () => {
        it('creates for all prev targets when current month empty', async () => {
            vi.mocked(prisma.salesTarget.findMany)
                .mockResolvedValueOnce([
                    { id: 't-prev1', userId: 'u1', revenueTarget: new Decimal(1000), visitTarget: 10, orderTarget: null, notes: 'n', periodYear: 2026, periodMonth: 7 } as never,
                    { id: 't-prev2', userId: 'u2', revenueTarget: new Decimal(2000), visitTarget: 5, orderTarget: null, notes: null, periodYear: 2026, periodMonth: 7 } as never,
                ])
                .mockResolvedValueOnce([] as never);
            vi.mocked(prisma.salesTarget.create).mockResolvedValue({} as never);

            const res = await copyTargetsFromPreviousMonth(2026, 8, 'admin');
            expect(res.created).toBe(2);
            expect(res.skipped).toBe(0);
            expect(prisma.salesTarget.create).toHaveBeenCalledTimes(2);
        });

        it('skips existing targets in current month', async () => {
            vi.mocked(prisma.salesTarget.findMany)
                .mockResolvedValueOnce([
                    { id: 't-prev1', userId: 'u1', revenueTarget: new Decimal(1000), visitTarget: 10, orderTarget: null, notes: null, periodYear: 2026, periodMonth: 7 } as never,
                    { id: 't-prev2', userId: 'u2', revenueTarget: new Decimal(2000), visitTarget: 5, orderTarget: null, notes: null, periodYear: 2026, periodMonth: 7 } as never,
                ])
                .mockResolvedValueOnce([{ userId: 'u1' } as never]);

            vi.mocked(prisma.salesTarget.create).mockResolvedValue({} as never);

            const res = await copyTargetsFromPreviousMonth(2026, 8, 'admin');
            expect(res.created).toBe(1);
            expect(res.skipped).toBe(1);
            expect(res.skippedUserIds).toContain('u1');
            expect(prisma.salesTarget.create).toHaveBeenCalledTimes(1);
        });

        it('Januari -> Desember tahun lalu', async () => {
            vi.mocked(prisma.salesTarget.findMany)
                .mockResolvedValueOnce([{ id: 't-dec', userId: 'u1', revenueTarget: new Decimal(999), visitTarget: 1, orderTarget: null, notes: null, periodYear: 2025, periodMonth: 12 } as never])
                .mockResolvedValueOnce([] as never);
            vi.mocked(prisma.salesTarget.create).mockResolvedValue({} as never);

            const res = await copyTargetsFromPreviousMonth(2026, 1, 'admin');
            expect(res.created).toBe(1);

            const firstCall = vi.mocked(prisma.salesTarget.findMany).mock.calls[0][0] as any;
            expect(firstCall.where).toEqual({ periodYear: 2025, periodMonth: 12 });
        });

        it('prev month has no targets -> 0 created', async () => {
            vi.mocked(prisma.salesTarget.findMany)
                .mockResolvedValueOnce([] as never)
                .mockResolvedValueOnce([] as never);

            const res = await copyTargetsFromPreviousMonth(2026, 8, 'admin');
            expect(res.created).toBe(0);
            expect(res.skipped).toBe(0);
            expect(prisma.salesTarget.create).not.toHaveBeenCalled();
        });

        it('per-item create error collected not thrown', async () => {
            vi.mocked(prisma.salesTarget.findMany)
                .mockResolvedValueOnce([
                    { id: 't1', userId: 'u-good', revenueTarget: new Decimal(100), visitTarget: null, orderTarget: null, notes: null, periodYear: 2026, periodMonth: 7 } as never,
                    { id: 't2', userId: 'u-bad', revenueTarget: new Decimal(200), visitTarget: null, orderTarget: null, notes: null, periodYear: 2026, periodMonth: 7 } as never,
                ])
                .mockResolvedValueOnce([] as never);

            vi.mocked(prisma.salesTarget.create)
                .mockResolvedValueOnce({} as never)
                .mockRejectedValueOnce(new Error('FK fail'));

            const res = await copyTargetsFromPreviousMonth(2026, 8, 'admin');
            expect(res.created).toBe(1);
            expect(res.errors).toHaveLength(1);
            expect(res.errors[0].userId).toBe('u-bad');
        });
    });

    describe('getTargetsForPeriod — achievement + divide-by-zero + visit filtering', () => {
        it('computes revenueActual & achievement', async () => {
            vi.mocked(prisma.salesTarget.findMany).mockResolvedValue([
                { id: 't1', userId: 'u1', periodYear: 2026, periodMonth: 8, revenueTarget: new Decimal(1000000), visitTarget: 10, orderTarget: null, notes: null, createdById: null, createdAt: new Date(), updatedAt: new Date(), user: { name: 'Budi' } } as never,
            ] as never);

            vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
                { id: 'so1', salesRepId: 'u1', totalAmount: new Decimal(600000), status: 'CONFIRMED' } as never,
                { id: 'so2', salesRepId: 'u1', totalAmount: new Decimal(200000), status: 'DELIVERED' } as never,
            ] as never);

            vi.mocked(prisma.salesReturn.findMany).mockResolvedValue([] as never);
            vi.mocked(prisma.salesVisit.findMany).mockResolvedValue([
                { userId: 'u1' } as never,
                { userId: 'u1' } as never,
                { userId: 'u1' } as never,
            ] as never);

            const rows = await getTargetsForPeriod(2026, 8);
            expect(rows).toHaveLength(1);
            expect(rows[0].userName).toBe('Budi');
            // 600k + 200k = 800k => 80% of 1M
            expect(rows[0].revenueActual.toNumber()).toBe(800000);
            expect(rows[0].revenueAchievementPercent).toBe(80);
            expect(rows[0].visitActual).toBe(3);
            expect(rows[0].visitAchievementPercent).toBe(30); // 3/10*100=30
        });

        it('divide-by-zero: revenueTarget=0 => achievement null', async () => {
            vi.mocked(prisma.salesTarget.findMany).mockResolvedValue([
                { id: 't1', userId: 'u1', periodYear: 2026, periodMonth: 8, revenueTarget: new Decimal(0), visitTarget: 10, orderTarget: null, notes: null, createdById: null, createdAt: new Date(), updatedAt: new Date(), user: { name: 'Budi' } } as never,
            ] as never);
            vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
                { id: 'so1', salesRepId: 'u1', totalAmount: new Decimal(100), status: 'CONFIRMED' } as never,
            ] as never);
            vi.mocked(prisma.salesReturn.findMany).mockResolvedValue([] as never);
            vi.mocked(prisma.salesVisit.findMany).mockResolvedValue([] as never);

            const rows = await getTargetsForPeriod(2026, 8);
            expect(rows[0].revenueAchievementPercent).toBeNull();
        });

        it('visitTarget null or 0 => visitAchievementPercent null (no div by zero)', async () => {
            vi.mocked(prisma.salesTarget.findMany).mockResolvedValue([
                { id: 't1', userId: 'u1', periodYear: 2026, periodMonth: 8, revenueTarget: new Decimal(100), visitTarget: null, orderTarget: null, notes: null, createdById: null, createdAt: new Date(), updatedAt: new Date(), user: { name: 'X' } } as never,
                { id: 't2', userId: 'u2', periodYear: 2026, periodMonth: 8, revenueTarget: new Decimal(100), visitTarget: 0, orderTarget: null, notes: null, createdById: null, createdAt: new Date(), updatedAt: new Date(), user: { name: 'Y' } } as never,
            ] as never);
            vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([] as never);
            vi.mocked(prisma.salesReturn.findMany).mockResolvedValue([] as never);
            vi.mocked(prisma.salesVisit.findMany).mockResolvedValue([{ userId: 'u1' } as never] as never);

            const rows = await getTargetsForPeriod(2026, 8);
            expect(rows[0].visitAchievementPercent).toBeNull();
            expect(rows[1].visitAchievementPercent).toBeNull();
        });

        it('uses reviewStatus != REJECTED filter for visits (Q3 consistent)', async () => {
            vi.mocked(prisma.salesTarget.findMany).mockResolvedValue([
                { id: 't1', userId: 'u1', periodYear: 2026, periodMonth: 8, revenueTarget: new Decimal(100), visitTarget: 5, orderTarget: null, notes: null, createdById: null, createdAt: new Date(), updatedAt: new Date(), user: { name: 'B' } } as never,
            ] as never);
            vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([] as never);
            vi.mocked(prisma.salesReturn.findMany).mockResolvedValue([] as never);
            vi.mocked(prisma.salesVisit.findMany).mockResolvedValue([] as never);

            await getTargetsForPeriod(2026, 8);

            const visitWhere = vi.mocked(prisma.salesVisit.findMany).mock.calls[0][0] as any;
            expect(visitWhere.where.reviewStatus).toEqual({ not: 'REJECTED' });
        });

        it('returns empty list when no targets', async () => {
            vi.mocked(prisma.salesTarget.findMany).mockResolvedValue([] as never);
            const rows = await getTargetsForPeriod(2026, 8);
            expect(rows).toEqual([]);
            expect(prisma.salesOrder.findMany).not.toHaveBeenCalled();
        });

        it('uses calculateSalesOrderRevenueWithReturns (pure) for revenue', async () => {
            vi.mocked(prisma.salesTarget.findMany).mockResolvedValue([
                { id: 't1', userId: 'u1', periodYear: 2026, periodMonth: 8, revenueTarget: new Decimal(1000), visitTarget: null, orderTarget: null, notes: null, createdById: null, createdAt: new Date(), updatedAt: new Date(), user: { name: 'B' } } as never,
            ] as never);
            vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
                { id: 'so1', salesRepId: 'u1', totalAmount: new Decimal(1000), status: 'CONFIRMED' } as never,
            ] as never);
            vi.mocked(prisma.salesReturn.findMany).mockResolvedValue([
                { id: 'ret1', totalAmount: new Decimal(100), status: 'COMPLETED', salesOrder: { salesRepId: 'u1' } } as never,
            ] as never);
            vi.mocked(prisma.salesVisit.findMany).mockResolvedValue([] as never);

            const rows = await getTargetsForPeriod(2026, 8);
            // 1000 - 100 = 900
            expect(rows[0].revenueActual.toNumber()).toBe(900);
        });
    });

    describe('getMyTarget', () => {
        it('returns null if not found', async () => {
            vi.mocked(prisma.salesTarget.findUnique).mockResolvedValue(null);
            const res = await getMyTarget('u1', 2026, 8);
            expect(res).toBeNull();
        });

        it('returns achievement for single user', async () => {
            vi.mocked(prisma.salesTarget.findUnique).mockResolvedValue({
                id: 't1', userId: 'u1', periodYear: 2026, periodMonth: 8, revenueTarget: new Decimal(1000), visitTarget: 10, orderTarget: null, notes: null, createdById: null, createdAt: new Date(), updatedAt: new Date(), user: { name: 'Budi' },
            } as never);
            vi.mocked(prisma.salesOrder.findMany).mockResolvedValue([
                { id: 'so1', salesRepId: 'u1', totalAmount: new Decimal(500), status: 'CONFIRMED' } as never,
            ] as never);
            vi.mocked(prisma.salesReturn.findMany).mockResolvedValue([] as never);
            vi.mocked(prisma.salesVisit.count).mockResolvedValue(4);

            const res = await getMyTarget('u1', 2026, 8);
            expect(res).not.toBeNull();
            expect(res!.revenueActual.toNumber()).toBe(500);
            expect(res!.revenueAchievementPercent).toBe(50);
            expect(res!.visitActual).toBe(4);
            expect(res!.visitAchievementPercent).toBe(40);
        });

        it('validates userId', async () => {
            await expect(getMyTarget('', 2026, 8)).rejects.toThrow(/userId/);
        });
    });
});
