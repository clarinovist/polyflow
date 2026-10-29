import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessRuleError } from '@/lib/errors/errors';

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
}));

const {
    mockFindManyOrders,
    mockFindUniqueLock,
    mockUpsertLock,
    mockDeleteManyLock,
    mockTransaction,
    mockGetPeriodCostReport,
    mockRequireFinanceAccess,
    mockRequireFinanceApprover,
    mockLogActivity,
} = vi.hoisted(() => ({
    mockFindManyOrders: vi.fn(),
    mockFindUniqueLock: vi.fn(),
    mockUpsertLock: vi.fn(),
    mockDeleteManyLock: vi.fn(),
    mockTransaction: vi.fn(),
    mockGetPeriodCostReport: vi.fn(),
    mockRequireFinanceAccess: vi.fn(),
    mockRequireFinanceApprover: vi.fn(),
    mockLogActivity: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: {
            findMany: mockFindManyOrders,
        },
        periodLock: {
            findUnique: mockFindUniqueLock,
            upsert: mockUpsertLock,
            deleteMany: mockDeleteManyLock,
        },
        $transaction: mockTransaction,
    },
}));

vi.mock('@/services/accounting/costing-service', () => ({
    CostingService: {
        getPeriodCostReport: mockGetPeriodCostReport,
    },
}));

vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceAccess: mockRequireFinanceAccess,
    requireFinanceApprover: mockRequireFinanceApprover,
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: mockLogActivity,
}));

import {
    getHppReportData,
    lockPeriod,
    unlockPeriod,
} from '../hpp-report';

const defaultConversion = {
    enabled: false,
    pool: 0,
    allocated: 0,
    unallocated: 0,
    byAccount: [],
};

describe('hpp-report actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireFinanceAccess.mockResolvedValue({
            user: { id: 'user-fin', name: 'Finance User', role: 'FINANCE' },
        });
        mockRequireFinanceApprover.mockResolvedValue({
            user: { id: 'user-app', name: 'Approver User', role: 'FINANCE' },
        });
        mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
            cb({
                productionOrder: { findMany: mockFindManyOrders },
                periodLock: {
                    findUnique: mockFindUniqueLock,
                    upsert: mockUpsertLock,
                    deleteMany: mockDeleteManyLock,
                },
            }),
        );
    });

    describe('getHppReportData', () => {
        it('returns error when finance read access is denied', async () => {
            mockRequireFinanceAccess.mockRejectedValueOnce(
                new BusinessRuleError('Unauthorized'),
            );

            const res = await getHppReportData();

            expect(res.success).toBe(false);
            expect(mockGetPeriodCostReport).not.toHaveBeenCalled();
        });

        it('returns empty report and null lock for an unlocked month without production', async () => {
            mockGetPeriodCostReport.mockResolvedValueOnce({
                costs: [],
                conversion: defaultConversion,
            });
            mockFindUniqueLock.mockResolvedValueOnce(null);

            const res = await getHppReportData(
                new Date('2026-10-05T00:00:00.000Z'),
            );

            expect(res.success).toBe(true);
            if (!res.success) return;
            expect(mockGetPeriodCostReport).toHaveBeenCalledWith(
                new Date('2026-09-30T17:00:00.000Z'),
                new Date('2026-10-31T16:59:59.999Z'),
            );
            expect(mockFindUniqueLock).toHaveBeenCalledWith({
                where: { year_month: { year: 2026, month: 10 } },
                include: {
                    lockedBy: { select: { name: true, email: true } },
                },
            });
            expect(res.data.summary.totalCogm).toBe(0);
            expect(res.data.lock).toBeNull();
        });

        it('returns enriched HPP data along with lock info and parsed snapshot', async () => {
            mockGetPeriodCostReport.mockResolvedValueOnce({
                costs: [
                    {
                        productionOrderId: 'po-1',
                        orderNumber: 'WO-001',
                        status: 'COMPLETED',
                        materialCost: 100_000,
                        machineCost: 20_000,
                        laborCost: 30_000,
                        overheadCost: 0,
                        totalCost: 150_000,
                        quantityProduced: 50,
                        unitCost: 3_000,
                    },
                ],
                conversion: defaultConversion,
            });
            mockFindManyOrders.mockResolvedValueOnce([
                {
                    id: 'po-1',
                    bom: {
                        id: 'bom-1',
                        name: 'BOM A',
                        category: 'FILM',
                        productVariant: {
                            name: 'Variant A',
                            skuCode: 'SKU-A',
                            standardCost: 2_500,
                            product: { name: 'Produk A' },
                        },
                    },
                },
            ]);
            const snapshot = {
                version: 1 as const,
                computedAt: '2026-10-28T10:00:00.000Z',
                totalCogm: 140_000,
                totalQuantity: 50,
                orderCount: 1,
                orders: [
                    {
                        productionOrderId: 'po-1',
                        orderNumber: 'WO-001',
                        totalCost: 140_000,
                    },
                ],
            };
            mockFindUniqueLock.mockResolvedValueOnce({
                id: 'lock-1',
                year: 2026,
                month: 10,
                lockedAt: new Date('2026-10-28T10:00:00.000Z'),
                lockedById: 'user-app',
                notes: 'Tutup buku Oktober',
                snapshot,
                lockedBy: { name: 'Approver User', email: 'approver@example.com' },
            });

            const res = await getHppReportData(
                new Date('2026-10-10T00:00:00.000Z'),
            );

            expect(res.success).toBe(true);
            if (!res.success) return;
            expect(res.data.summary.totalCogm).toBe(150_000);
            expect(res.data.products).toHaveLength(1);
            expect(res.data.lock).toEqual({
                lockedAt: '2026-10-28T10:00:00.000Z',
                lockedByName: 'Approver User',
                notes: 'Tutup buku Oktober',
                snapshot,
            });
        });

        it('returns lock with null snapshot for legacy locks created before snapshot column', async () => {
            mockGetPeriodCostReport.mockResolvedValueOnce({
                costs: [],
                conversion: defaultConversion,
            });
            mockFindUniqueLock.mockResolvedValueOnce({
                id: 'lock-legacy',
                year: 2026,
                month: 9,
                lockedAt: new Date('2026-09-30T10:00:00.000Z'),
                lockedById: null,
                notes: null,
                snapshot: null,
                lockedBy: null,
            });

            const res = await getHppReportData(
                new Date('2026-09-15T00:00:00.000Z'),
            );

            expect(res.success).toBe(true);
            if (!res.success) return;
            expect(res.data.lock).toEqual({
                lockedAt: '2026-09-30T10:00:00.000Z',
                lockedByName: null,
                notes: null,
                snapshot: null,
            });
        });
    });

    describe('lockPeriod', () => {
        it('saves snapshot and logs LOCK_HPP_PERIOD atomically in a transaction', async () => {
            mockGetPeriodCostReport.mockResolvedValueOnce({
                costs: [
                    {
                        productionOrderId: 'po-1',
                        orderNumber: 'WO-001',
                        status: 'COMPLETED',
                        materialCost: 100_000,
                        machineCost: 0,
                        laborCost: 20_000,
                        overheadCost: 0,
                        totalCost: 120_000,
                        quantityProduced: 40,
                        unitCost: 3_000,
                    },
                ],
                conversion: defaultConversion,
            });
            mockUpsertLock.mockImplementationOnce(async (args: { create: { snapshot: unknown } }) => ({
                id: 'lock-oct',
                year: 2026,
                month: 10,
                lockedAt: new Date('2026-10-29T08:00:00.000Z'),
                lockedById: 'user-app',
                notes: 'Final Oktober',
                snapshot: args.create.snapshot,
                lockedBy: { name: 'Approver User', email: 'approver@example.com' },
            }));

            const res = await lockPeriod(2026, 10, 'Final Oktober');

            expect(res.success).toBe(true);
            expect(mockTransaction).toHaveBeenCalledTimes(1);
            const txPassedToCallback = await mockTransaction.mock.results[0].value;
            expect(txPassedToCallback).toBeDefined();
            expect(mockGetPeriodCostReport).toHaveBeenCalledWith(
                new Date('2026-09-30T17:00:00.000Z'),
                new Date('2026-10-31T16:59:59.999Z'),
            );
            expect(mockUpsertLock).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { year_month: { year: 2026, month: 10 } },
                    create: expect.objectContaining({
                        year: 2026,
                        month: 10,
                        lockedById: 'user-app',
                        notes: 'Final Oktober',
                        snapshot: expect.objectContaining({
                            version: 1,
                            totalCogm: 120_000,
                            totalQuantity: 40,
                            orderCount: 1,
                            orders: [
                                {
                                    productionOrderId: 'po-1',
                                    orderNumber: 'WO-001',
                                    totalCost: 120_000,
                                },
                            ],
                        }),
                    }),
                }),
            );
            const passedTx = mockLogActivity.mock.calls[0][0].tx;
            expect(passedTx.periodLock.upsert).toBe(mockUpsertLock);
            expect(mockLogActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-app',
                    action: 'LOCK_HPP_PERIOD',
                    entityType: 'PeriodLock',
                    entityId: 'lock-oct',
                    changes: expect.objectContaining({
                        year: 2026,
                        month: 10,
                        snapshot: expect.objectContaining({
                            version: 1,
                            totalCogm: 120_000,
                        }),
                    }),
                    tx: expect.any(Object),
                }),
            );
        });

        it('does not open transaction, upsert lock, or log audit when snapshot calculation fails', async () => {
            mockGetPeriodCostReport.mockRejectedValueOnce(
                new BusinessRuleError('Gagal menghitung biaya periode'),
            );

            const res = await lockPeriod(2026, 10);

            expect(res.success).toBe(false);
            expect(mockTransaction).not.toHaveBeenCalled();
            expect(mockUpsertLock).not.toHaveBeenCalled();
            expect(mockLogActivity).not.toHaveBeenCalled();
        });
    });

    describe('unlockPeriod', () => {
        it('logs UNLOCK_HPP_PERIOD with previous snapshot in changes before deleting', async () => {
            const oldSnapshot = {
                version: 1,
                computedAt: '2026-10-28T10:00:00.000Z',
                totalCogm: 120_000,
                totalQuantity: 40,
                orderCount: 1,
                orders: [{ productionOrderId: 'po-1', totalCost: 120_000 }],
            };
            mockFindUniqueLock.mockResolvedValueOnce({
                id: 'lock-oct',
                year: 2026,
                month: 10,
                lockedAt: new Date('2026-10-28T10:00:00.000Z'),
                lockedById: 'user-app',
                notes: null,
                snapshot: oldSnapshot,
            });
            mockDeleteManyLock.mockResolvedValueOnce({ count: 1 });

            const res = await unlockPeriod(2026, 10);

            expect(res.success).toBe(true);
            expect(mockTransaction).toHaveBeenCalledTimes(1);
            expect(mockLogActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-app',
                    action: 'UNLOCK_HPP_PERIOD',
                    entityType: 'PeriodLock',
                    entityId: 'lock-oct',
                    changes: expect.objectContaining({
                        year: 2026,
                        month: 10,
                        snapshot: oldSnapshot,
                    }),
                    tx: expect.any(Object),
                }),
            );
            expect(mockDeleteManyLock).toHaveBeenCalledWith({
                where: { year: 2026, month: 10 },
            });
        });
    });

    describe('migration SQL', () => {
        it('adds nullable snapshot JSONB column to period_locks without backfill', () => {
            const sql = readFileSync(
                'prisma/migrations/20261029_period_lock_snapshot/migration.sql',
                'utf8',
            );
            expect(sql).toContain(
                'ALTER TABLE "period_locks" ADD COLUMN "snapshot" JSONB;',
            );
            expect(sql).not.toMatch(/NOT NULL|UPDATE|DELETE/i);
        });
    });
});
