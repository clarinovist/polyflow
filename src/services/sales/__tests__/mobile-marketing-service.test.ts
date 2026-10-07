import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const m = vi.hoisted(() => ({
    tenantDbContext: vi.fn(),
    transaction: vi.fn(),
    user: vi.fn(),
    targets: vi.fn(),
    orderGroup: vi.fn(),
    visitGroup: vi.fn(),
    plans: vi.fn(),
    orderCount: vi.fn(),
    orders: vi.fn(),
    customerCount: vi.fn(),
    customers: vi.fn(),
    visitCount: vi.fn(),
    visits: vi.fn(),
    invoiceCount: vi.fn(),
    invoiceAggregate: vi.fn(),
    returns: vi.fn(),
}));

const tx = {
    user: { findMany: m.user },
    salesTarget: { findMany: m.targets },
    salesOrder: { groupBy: m.orderGroup, count: m.orderCount, findMany: m.orders },
    salesVisit: { groupBy: m.visitGroup, count: m.visitCount, findMany: m.visits },
    salesRoutePlan: { findMany: m.plans },
    customer: { count: m.customerCount, findMany: m.customers },
    invoice: { count: m.invoiceCount, aggregate: m.invoiceAggregate },
    salesReturn: { findMany: m.returns },
};

vi.mock('@/lib/core/prisma', () => ({
    getTenantDbFromContext: m.tenantDbContext,
}));

import {
    MARKETING_MOBILE_SAMPLE_LIMIT,
    readMarketingMobileOverview,
} from '../mobile-marketing-service';

const now = new Date('2026-10-07T03:00:00.000Z');

function arrangeBase() {
    m.transaction.mockImplementation(
        async (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    m.user.mockResolvedValue([
        { id: 'sales-b', name: 'Budi' },
        { id: 'sales-a', name: 'Ani' },
    ]);
    m.targets.mockResolvedValue([
        {
            userId: 'sales-a',
            orderTarget: 4,
            visitTarget: 8,
            revenueTarget: new Prisma.Decimal(1000),
        },
    ]);
    m.orderGroup.mockResolvedValue([
        { salesRepId: 'sales-a', _count: { id: 2 } },
    ]);
    m.visitGroup
        .mockResolvedValueOnce([
            { userId: 'sales-a', _count: { id: 4 } },
        ])
        .mockResolvedValueOnce([
            { userId: 'sales-a', _count: { id: 2 } },
        ])
        .mockResolvedValueOnce([
            { userId: 'sales-a', _count: { id: 1 } },
        ]);
    m.plans.mockResolvedValue([
        {
            userId: 'sales-a',
            items: [{ status: 'COMPLETED' }, { status: 'PENDING' }],
        },
    ]);
    m.orderCount.mockResolvedValue(1);
    m.orders
        .mockResolvedValueOnce([
            {
                id: 'quote-1',
                orderNumber: 'Q-1',
                commercialReviewStatus: 'PENDING',
                nextFollowUpDate: now,
                validUntil: null,
                customer: { name: 'Customer Synthetic' },
                salesRep: { name: 'Ani' },
                totalAmount: new Prisma.Decimal(750),
            },
        ])
        .mockResolvedValueOnce([
            {
                id: 'order-1',
                salesRepId: 'sales-a',
                totalAmount: new Prisma.Decimal(750),
                status: 'CONFIRMED',
            },
        ]);
    m.customerCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    m.customers
        .mockResolvedValueOnce([
            {
                id: 'prospect-1',
                name: 'Prospek Synthetic',
                createdAt: new Date('2026-10-01T00:00:00.000Z'),
                createdBy: { name: 'Ani' },
                salesAssignments: [],
            },
        ])
        .mockResolvedValueOnce([
            {
                id: 'customer-1',
                name: 'Customer Lama',
                city: 'Bandung',
                updatedAt: new Date('2026-09-01T00:00:00.000Z'),
                salesAssignments: [{ user: { name: 'Budi' } }],
            },
        ]);
    m.visitCount.mockResolvedValue(1);
    m.visits.mockResolvedValue([
        {
            id: 'visit-1',
            checkInTime: new Date('2026-10-02T00:00:00.000Z'),
            customer: { name: 'Customer Visit' },
            user: { name: 'Budi' },
        },
    ]);
    m.invoiceCount.mockResolvedValue(3);
    m.invoiceAggregate.mockResolvedValue({
        _sum: {
            totalAmount: new Prisma.Decimal(1000),
            paidAmount: new Prisma.Decimal(200),
            creditedAmount: new Prisma.Decimal(100),
            priceAdjustmentAmount: new Prisma.Decimal(50),
        },
    });
    m.returns.mockResolvedValue([]);
}

beforeEach(() => {
    vi.resetAllMocks();
    m.tenantDbContext.mockReturnValue({ $transaction: m.transaction });
    arrangeBase();
});

describe('marketing mobile read service', () => {
    it('returns global SALES-team aggregates with deterministic counts and samples', async () => {
        const result = await readMarketingMobileOverview({
            canViewPrices: false,
            now,
        });

        expect(result.highlights).toMatchObject({
            teamMemberCount: 2,
            pipelineExceptionCount: 1,
            pendingReviewCount: 2,
            customersWithoutFollowUpCount: 1,
            overdueReceivableCount: 3,
        });
        expect(result.team.items.map((item) => item.id)).toEqual([
            'sales-a',
            'sales-b',
        ]);
        expect(result.team.items[0]).toMatchObject({
            orders: { actual: 2, target: 4, gap: 2 },
            visits: { actual: 4, target: 8, gap: 4 },
        });
        expect(result.teamTarget).toMatchObject({
            orders: { actual: 2, target: 4, gap: 2 },
            visits: { actual: 4, target: 8, gap: 4 },
        });
        expect(result.compliance.items[0]).toMatchObject({
            id: 'sales-a',
            assigned: 2,
            visited: 2,
            extraCalls: 1,
            compliancePercent: 50,
        });
        expect(result.compliance.items[1]).toMatchObject({
            id: 'sales-b',
            compliancePercent: 0,
        });
        expect(result.reviews).toMatchObject({ total: 2, returned: 2 });
        expect(result.tasks.total).toBe(4);
        expect(result.tasks.returned).toBe(4);
        expect(m.user).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    OR: expect.arrayContaining([
                        { role: 'SALES' },
                        { roles: { some: { role: 'SALES' } } },
                    ]),
                }),
            }),
        );
        expect(m.tenantDbContext).toHaveBeenCalledOnce();
        expect(m.transaction).toHaveBeenCalledWith(
            expect.any(Function),
            { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
        );
    });

    it('fails closed before any query when tenant context is unavailable', async () => {
        m.tenantDbContext.mockReturnValue(undefined);

        await expect(
            readMarketingMobileOverview({ canViewPrices: false, now }),
        ).rejects.toThrow(
            'Konteks tenant untuk ringkasan marketing tidak tersedia.',
        );
        expect(m.transaction).not.toHaveBeenCalled();
        expect(m.user).not.toHaveBeenCalled();
    });

    it('uses the exact tenant context client for the snapshot transaction', async () => {
        const contextTransaction = vi.fn(
            async (fn: (client: typeof tx) => unknown) => fn(tx),
        );
        m.tenantDbContext.mockReturnValue({
            $transaction: contextTransaction,
        });

        await readMarketingMobileOverview({ canViewPrices: false, now });

        expect(contextTransaction).toHaveBeenCalledWith(
            expect.any(Function),
            { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
        );
        expect(m.transaction).not.toHaveBeenCalled();
    });

    it('uses canonical compliance semantics above 100 percent', async () => {
        m.user.mockResolvedValue([{ id: 'sales-a', name: 'Ani' }]);
        m.visitGroup.mockReset();
        m.visitGroup
            .mockResolvedValueOnce([
                { userId: 'sales-a', _count: { id: 2 } },
            ])
            .mockResolvedValueOnce([
                { userId: 'sales-a', _count: { id: 2 } },
            ])
            .mockResolvedValueOnce([]);
        m.plans.mockResolvedValue([
            { userId: 'sales-a', items: [{ status: 'COMPLETED' }] },
        ]);

        const result = await readMarketingMobileOverview({
            canViewPrices: false,
            now,
        });

        expect(result.compliance.items[0]).toMatchObject({
            assigned: 1,
            visited: 2,
            extraCalls: 0,
            compliancePercent: 200,
        });
    });

    it('omits every amount field and amount-bearing queries without price permission', async () => {
        const result = await readMarketingMobileOverview({
            canViewPrices: false,
            now,
        });

        expect('overdueReceivableAmount' in result.highlights).toBe(false);
        expect(result.team.items.every((item) => !('revenue' in item))).toBe(true);
        expect('revenue' in result.teamTarget).toBe(false);
        expect(
            result.pipelineExceptions.items.every(
                (item) => !('amount' in item),
            ),
        ).toBe(true);
        expect(m.invoiceAggregate).not.toHaveBeenCalled();
        expect(m.returns).not.toHaveBeenCalled();
        expect(m.orders).toHaveBeenCalledTimes(1);
        const targetSelect = m.targets.mock.calls[0][0].select;
        expect(targetSelect).not.toHaveProperty('revenueTarget');
        expect(m.orders.mock.calls[0][0].select).not.toHaveProperty(
            'totalAmount',
        );
    });

    it('includes nominal fields only with canonical price permission', async () => {
        const result = await readMarketingMobileOverview({
            canViewPrices: true,
            now,
        });

        expect(result.highlights.overdueReceivableAmount).toBe(750);
        expect(result.team.items[0].revenue).toMatchObject({
            targetAmount: 1000,
            actualAmount: 750,
            gapAmount: 250,
            achievementPercent: 75,
        });
        expect(result.teamTarget.revenue).toMatchObject({
            targetAmount: 1000,
            actualAmount: 750,
            gapAmount: 250,
            achievementPercent: 75,
        });
        expect(result.pipelineExceptions.items[0].amount).toBe(750);
        expect(m.invoiceAggregate).toHaveBeenCalledOnce();
        expect(m.returns).toHaveBeenCalledOnce();
        expect(m.orders).toHaveBeenCalledTimes(2);
    });

    it('caps initial tasks at ten while preserving the full total', async () => {
        m.orderCount.mockResolvedValue(7);
        m.customerCount.mockReset();
        m.customerCount.mockResolvedValueOnce(4).mockResolvedValueOnce(5);
        m.visitCount.mockResolvedValue(6);
        m.orders.mockReset();
        m.orders.mockResolvedValue(
            Array.from({ length: MARKETING_MOBILE_SAMPLE_LIMIT }, (_, index) => ({
                id: `quote-${index}`,
                orderNumber: `Q-${index}`,
                commercialReviewStatus: 'PENDING',
                nextFollowUpDate: new Date(2026, 9, index + 1),
                validUntil: null,
                customer: { name: 'Customer' },
                salesRep: { name: 'Sales' },
            })),
        );
        m.customers.mockReset();
        m.customers.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
        m.visits.mockResolvedValue([]);

        const result = await readMarketingMobileOverview({
            canViewPrices: false,
            now,
        });

        expect(result.tasks).toMatchObject({
            total: 22,
            returned: MARKETING_MOBILE_SAMPLE_LIMIT,
        });
        expect(result.tasks.items).toHaveLength(MARKETING_MOBILE_SAMPLE_LIMIT);
        expect(result.pipelineExceptions).toMatchObject({
            total: 7,
            returned: MARKETING_MOBILE_SAMPLE_LIMIT,
        });
    });

    it('queries only the active SALES team rather than actor-personal scope', async () => {
        await readMarketingMobileOverview({ canViewPrices: false, now });

        const pipelineWhere = m.orderCount.mock.calls[0][0].where;
        expect(pipelineWhere.salesRepId).toEqual({
            in: ['sales-b', 'sales-a'],
        });
        expect(pipelineWhere).not.toHaveProperty('createdById');
        expect(m.invoiceCount.mock.calls[0][0].where.salesOrder.salesRepId).toEqual({
            in: ['sales-b', 'sales-a'],
        });
        expect(m.customerCount.mock.calls[1][0].where.AND).toHaveLength(3);
    });
});
