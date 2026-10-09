import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const prisma = {
        purchaseRequest: { count: vi.fn(), findMany: vi.fn() },
        purchaseOrder: {
            count: vi.fn(),
            findMany: vi.fn(),
            aggregate: vi.fn(),
            groupBy: vi.fn(),
        },
        purchaseInvoice: {
            count: vi.fn(),
            aggregate: vi.fn(),
            findMany: vi.fn(),
            fields: { paidAmount: Symbol('paidAmount') },
        },
        supplier: { findUnique: vi.fn() },
    };
    return {
        prisma,
        guard: vi.fn(),
        permissions: vi.fn(),
        reorder: vi.fn(),
        metrics: vi.fn(),
    };
});

vi.mock('@/lib/core/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/auth/purchasing-access', () => ({
    requirePurchasingAccess: mocks.guard,
}));
vi.mock('@/actions/admin/permissions', () => ({
    getMyExplicitFeaturePermissions: mocks.permissions,
}));
vi.mock('@/lib/errors/errors', () => ({
    safeAction: async (fn: () => Promise<unknown>) => {
        try {
            return { success: true as const, data: await fn() };
        } catch (error) {
            return {
                success: false as const,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
}));
vi.mock('@/services/inventory/analytics-service', () => ({
    getSuggestedPurchases: mocks.reorder,
}));
vi.mock('@/services/purchasing/dashboard-metrics-service', () => ({
    readPurchasingDashboardNominalMetrics: mocks.metrics,
}));

import { PurchaseOrderStatus, PurchaseRequestStatus } from '@prisma/client';
import { getPurchasingShiftBoard } from '../purchasing-dashboard';
import { PR_AGING_THRESHOLD_DAYS } from '../purchasing-types';

const decimal = (value: number) => ({ toNumber: () => value });

function featureResult(allowed: boolean) {
    return {
        success: true as const,
        data: allowed ? ['feature:view-prices'] : [],
    };
}

describe('getPurchasingShiftBoard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.guard.mockResolvedValue({
            user: { id: 'u1', roles: ['PROCUREMENT'] },
        });
        mocks.permissions.mockResolvedValue(featureResult(true));
        mocks.prisma.purchaseRequest.count.mockResolvedValue(4);
        mocks.prisma.purchaseOrder.count.mockImplementation(
            async (args?: { where?: { status?: string } }) => {
                if (args?.where?.status === PurchaseOrderStatus.DRAFT) return 2;
                if (args?.where?.status === PurchaseOrderStatus.SENT) return 3;
                if (
                    args?.where?.status ===
                    PurchaseOrderStatus.PARTIAL_RECEIVED
                )
                    return 1;
                return 0;
            },
        );
        mocks.prisma.purchaseInvoice.count.mockResolvedValue(2);
        mocks.prisma.purchaseInvoice.aggregate.mockResolvedValue({
            _sum: { totalAmount: 1_000_000, paidAmount: 200_000 },
        });

        const oldDate = new Date();
        oldDate.setDate(
            oldDate.getDate() - (PR_AGING_THRESHOLD_DAYS + 2),
        );
        mocks.prisma.purchaseRequest.findMany.mockResolvedValue([
            {
                id: 'pr-1',
                requestNumber: 'PR-001',
                createdAt: oldDate,
                status: PurchaseRequestStatus.APPROVED,
            },
        ]);
        mocks.prisma.purchaseOrder.findMany.mockImplementation(
            async (args?: { where?: { status?: string } }) => {
                if (args?.where?.status === PurchaseOrderStatus.DRAFT) {
                    return [
                        {
                            id: 'po-draft',
                            orderNumber: 'PO-D1',
                            createdAt: oldDate,
                            supplier: { name: 'Supplier A' },
                        },
                    ];
                }
                if (args?.where?.status === PurchaseOrderStatus.SENT) {
                    return [
                        {
                            id: 'po-sent',
                            orderNumber: 'PO-S1',
                            supplier: { name: 'Supplier B' },
                        },
                    ];
                }
                if (
                    args?.where?.status ===
                    PurchaseOrderStatus.PARTIAL_RECEIVED
                ) {
                    return [
                        {
                            id: 'po-part',
                            orderNumber: 'PO-P1',
                            supplier: { name: 'Supplier C' },
                        },
                    ];
                }
                return [];
            },
        );
        mocks.prisma.purchaseInvoice.findMany.mockResolvedValue([
            {
                id: 'inv-1',
                invoiceNumber: 'PI-001',
                totalAmount: 500_000,
                paidAmount: 0,
                dueDate: oldDate,
                purchaseOrder: { supplier: { name: 'Supplier D' } },
            },
        ]);
        mocks.metrics.mockResolvedValue({
            monthlySpend: 5_000_000,
            previousFullMonthSpend: 4_000_000,
            previousFullMonthChangePercent: 25,
            topSupplierName: 'Top Supplier',
            topSupplierSpend: 2_000_000,
        });
        mocks.reorder.mockResolvedValue([
            {
                id: 'pv-1',
                name: 'PP Pure',
                skuCode: 'RM-PP',
                preferredSupplier: { name: 'Supplier X' },
                totalStock: 5,
                reorderPoint: decimal(20),
                reorderQuantity: decimal(50),
            },
        ]);
    });

    it.each(['ADMIN', 'PROCUREMENT', 'PLANNING'])(
        'preserves the purchasing root guard for %s and operational queues',
        async (role) => {
            mocks.guard.mockResolvedValue({ user: { id: 'u1', roles: [role] } });
            const res = await getPurchasingShiftBoard();

            expect(mocks.guard).toHaveBeenCalledTimes(1);
            expect(res.success).toBe(true);
            if (!res.success || !res.data) return;
            expect(res.data.counts).toMatchObject({
                pendingPrs: 4,
                draftPos: 2,
                awaitingReceiptPos: 3,
                partialPos: 1,
                overdueApCount: 2,
            });
            expect(res.data.attention.agingPrs[0]).toMatchObject({
                requestNumber: 'PR-001',
                status: PurchaseRequestStatus.APPROVED,
            });
            expect(res.data.attention.draftPos[0].orderNumber).toBe('PO-D1');
            expect(res.data.attention.awaitingReceipt[0].orderNumber).toBe(
                'PO-S1',
            );
            expect(res.data.attention.partialPos[0].orderNumber).toBe('PO-P1');
            expect(res.data.attention.suggestedReorder[0].skuCode).toBe('RM-PP');
        },
    );

    it('returns canonical nominal spend and AP details when capability is granted', async () => {
        const res = await getPurchasingShiftBoard();

        expect(res.success).toBe(true);
        if (!res.success || !res.data) return;
        expect(new Date(res.data.generatedAt).toString()).not.toBe(
            'Invalid Date',
        );
        expect(res.data.nominalAccess).toBe('AVAILABLE');
        expect(res.data.counts.overdueApAmount).toBe(800_000);
        expect(res.data.counts.monthlySpend).toBe(5_000_000);
        expect(res.data.attention.overdueAp[0]).toMatchObject({
            invoiceNumber: 'PI-001',
            remaining: 500_000,
        });
        expect(res.data.performance).toEqual({
            monthlySpend: 5_000_000,
            previousFullMonthSpend: 4_000_000,
            previousFullMonthChangePercent: 25,
            topSupplierName: 'Top Supplier',
            topSupplierSpend: 2_000_000,
        });
        expect(mocks.metrics).toHaveBeenCalledWith(
            mocks.prisma,
            expect.any(Date),
        );
    });

    it('preserves the canonical outstanding AP predicate for count, amount, and attention', async () => {
        await getPurchasingShiftBoard();

        const overdueQueries = [
            mocks.prisma.purchaseInvoice.count.mock.calls[0]?.[0],
            mocks.prisma.purchaseInvoice.aggregate.mock.calls[0]?.[0],
            mocks.prisma.purchaseInvoice.findMany.mock.calls[0]?.[0],
        ];
        for (const query of overdueQueries) {
            expect(query.where).toEqual({
                status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                dueDate: { lt: expect.any(Date) },
                totalAmount: {
                    gt: mocks.prisma.purchaseInvoice.fields.paidAmount,
                },
            });
        }
    });

    it.each([
        ['explicit denial', featureResult(false)],
        ['permission read failure', { success: false, error: 'read failed' }],
    ])(
        'fails nominal data closed on %s while preserving non-nominal data',
        async (_label, permissionResult) => {
            mocks.permissions.mockResolvedValue(permissionResult);

            const res = await getPurchasingShiftBoard();

            expect(res.success).toBe(true);
            if (!res.success || !res.data) return;
            expect(res.data).toMatchObject({
                nominalAccess: 'RESTRICTED',
                counts: {
                    pendingPrs: 4,
                    overdueApCount: 2,
                },
                attention: { overdueAp: [] },
                performance: {},
            });
            expect(res.data.counts).not.toHaveProperty('overdueApAmount');
            expect(res.data.counts).not.toHaveProperty('monthlySpend');
            expect(res.data.performance).not.toHaveProperty('monthlySpend');
            expect(res.data.performance).not.toHaveProperty(
                'previousFullMonthSpend',
            );
            expect(res.data.performance).not.toHaveProperty(
                'previousFullMonthChangePercent',
            );
            expect(res.data.performance).not.toHaveProperty('topSupplierName');
            expect(res.data.performance).not.toHaveProperty('topSupplierSpend');
            expect(res.data.attention.suggestedReorder).toHaveLength(1);
            expect(mocks.prisma.purchaseInvoice.count).toHaveBeenCalledTimes(1);
            expect(
                mocks.prisma.purchaseInvoice.aggregate,
            ).not.toHaveBeenCalled();
            expect(mocks.prisma.purchaseInvoice.findMany).not.toHaveBeenCalled();
            expect(mocks.metrics).not.toHaveBeenCalled();
            expect(mocks.prisma.purchaseOrder.aggregate).not.toHaveBeenCalled();
            expect(mocks.prisma.purchaseOrder.groupBy).not.toHaveBeenCalled();
            expect(mocks.prisma.supplier.findUnique).not.toHaveBeenCalled();
            expect(JSON.stringify(res.data)).not.toContain('PI-001');
            expect(JSON.stringify(res.data)).not.toContain('Top Supplier');
            expect(JSON.stringify(res.data)).not.toContain('5000000');
        },
    );

    it('queries aging PRs with the existing age threshold', async () => {
        await getPurchasingShiftBoard();
        const agingCall = mocks.prisma.purchaseRequest.findMany.mock
            .calls[0]?.[0] as {
            where?: { createdAt?: { lte?: Date }; status?: { in?: string[] } };
        };
        expect(agingCall?.where?.status?.in).toEqual(
            expect.arrayContaining([
                PurchaseRequestStatus.OPEN,
                PurchaseRequestStatus.APPROVED,
            ]),
        );
        expect(agingCall?.where?.createdAt?.lte).toBeInstanceOf(Date);
    });
});
