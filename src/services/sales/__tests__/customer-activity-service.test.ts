import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        customer: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        salesOrder: {
            findMany: vi.fn().mockResolvedValue([]),
            groupBy: vi.fn().mockResolvedValue([]),
        },
        salesVisit: {
            findMany: vi.fn().mockResolvedValue([]),
        },
    },
}));

vi.mock('@/services/sales/field-scope', () => ({
    scopedCustomerWhere: vi.fn().mockReturnValue({}),
    scopedSalesOrderWhere: vi.fn().mockReturnValue({}),
    getFieldSalesScope: vi.fn().mockReturnValue({
        actorUserId: 'admin',
        isGlobalViewer: true,
    }),
}));

import { prisma } from '@/lib/core/prisma';
import { getCustomerActivityReport } from '../customer-activity-service';

const mockCustomerFindMany = vi.mocked(prisma.customer.findMany);
const mockSoFindMany = vi.mocked(prisma.salesOrder.findMany);
const mockSoGroupBy = vi.mocked(prisma.salesOrder.groupBy);
const mockVisitFindMany = vi.mocked(prisma.salesVisit.findMany);

const ADMIN_SCOPE = { actorUserId: 'admin', isGlobalViewer: true };
const SALES_SCOPE = { actorUserId: 'sales-1', isGlobalViewer: false };

function makeCustomer(
    overrides: { id?: string; name?: string; createdAt?: Date } = {},
) {
    return {
        id: overrides.id || 'cus-1',
        name: overrides.name || 'Customer A',
        createdAt: overrides.createdAt || new Date('2026-01-01'),
    } as never;
}

function makeOrder(overrides: { customerId?: string; orderDate?: Date } = {}) {
    return {
        customerId: overrides.customerId || 'cus-1',
        orderDate: overrides.orderDate || new Date('2026-08-01'),
    };
}

function makeVisit(
    overrides: { customerId?: string; checkInTime?: Date } = {},
) {
    return {
        customerId: overrides.customerId || 'cus-1',
        checkInTime: overrides.checkInTime || new Date('2026-07-15'),
    } as never;
}

/**
 * Sets both findMany (windowed current/previous period) and groupBy
 * (all-time max orderDate) mocks from the same order fixtures — mirrors
 * what the two real prisma queries return for a given dataset.
 */
function setOrders(
    orders: ReturnType<typeof makeOrder>[],
    allTimeOrders: ReturnType<typeof makeOrder>[] = orders,
) {
    mockSoFindMany.mockResolvedValue(orders as never);

    const maxByCustomer = new Map<string, Date>();
    for (const o of allTimeOrders) {
        const cur = maxByCustomer.get(o.customerId);
        if (!cur || o.orderDate > cur) {
            maxByCustomer.set(o.customerId, o.orderDate);
        }
    }
    mockSoGroupBy.mockResolvedValue(
        Array.from(maxByCustomer.entries()).map(([customerId, orderDate]) => ({
            customerId,
            _max: { orderDate },
        })) as never,
    );
}

describe('getCustomerActivityReport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns empty result when no customers exist', async () => {
        mockCustomerFindMany.mockResolvedValue([]);
        setOrders([]);
        const result = await getCustomerActivityReport(ADMIN_SCOPE);
        expect(result.summary.dormantCount).toBe(0);
        expect(result.summary.newCount).toBe(0);
        expect(result.summary.lostCount).toBe(0);
        expect(result.summary.totalCustomersInScope).toBe(0);
    });

    it('classifies customer without any order as dormant', async () => {
        mockCustomerFindMany.mockResolvedValue([makeCustomer()]);
        setOrders([]);
        mockVisitFindMany.mockResolvedValue([]);

        const result = await getCustomerActivityReport(
            ADMIN_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );

        expect(result.dormantCustomers).toHaveLength(1);
        expect(result.dormantCustomers[0].customerId).toBe('cus-1');
        expect(result.dormantCustomers[0].lastOrderDate).toBeNull();
        expect(result.dormantCustomers[0].isAlsoNotVisited).toBe(true);
    });

    it('dormant tepat di batas N hari: N-1 hari = bukan dormant, N+1 hari = dormant', async () => {
        const now = new Date('2026-08-31T12:00:00Z');
        vi.useFakeTimers({ now });

        // N-1 = 59 hari dari sekarang → bukan dormant
        const lastOrderNMinus1 = new Date(
            now.getTime() - 59 * 24 * 60 * 60 * 1000,
        );
        mockCustomerFindMany.mockResolvedValue([
            makeCustomer({ id: 'cus-ok', name: 'OK Customer' }),
        ]);
        setOrders([
            makeOrder({
                customerId: 'cus-ok',
                orderDate: lastOrderNMinus1,
            }),
        ]);
        mockVisitFindMany.mockResolvedValue([]);

        const resultOk = await getCustomerActivityReport(
            ADMIN_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );
        expect(resultOk.dormantCustomers).toHaveLength(0);

        // N+1 = 61 hari dari sekarang → dormant
        const lastOrderNPlus1 = new Date(
            now.getTime() - 61 * 24 * 60 * 60 * 1000,
        );
        mockCustomerFindMany.mockResolvedValue([
            makeCustomer({ id: 'cus-dorm', name: 'Dormant Customer' }),
        ]);
        setOrders([
            makeOrder({
                customerId: 'cus-dorm',
                orderDate: lastOrderNPlus1,
            }),
        ]);
        mockVisitFindMany.mockResolvedValue([]);

        const resultDorm = await getCustomerActivityReport(
            ADMIN_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );
        expect(resultDorm.dormantCustomers).toHaveLength(1);
        expect(resultDorm.dormantCustomers[0].customerId).toBe('cus-dorm');

        vi.useRealTimers();
    });

    it('identifies new customers (createdAt in range)', async () => {
        mockCustomerFindMany.mockResolvedValue([
            makeCustomer({
                id: 'cus-new',
                name: 'New Customer',
                createdAt: new Date('2026-08-15'),
            }),
            makeCustomer({
                id: 'cus-old',
                name: 'Old Customer',
                createdAt: new Date('2026-01-01'),
            }),
        ]);
        setOrders([
            makeOrder({
                customerId: 'cus-old',
                orderDate: new Date('2026-08-10'),
            }),
        ]);
        mockVisitFindMany.mockResolvedValue([]);

        const result = await getCustomerActivityReport(
            ADMIN_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );

        expect(result.newCustomers).toHaveLength(1);
        expect(result.newCustomers[0].customerId).toBe('cus-new');
    });

    it('identifies lost customers (had orders previous period, none current)', async () => {
        // Previous period = July 1-31, current = Aug 1-31
        mockCustomerFindMany.mockResolvedValue([
            makeCustomer({
                id: 'cus-lost',
                name: 'Lost Customer',
                createdAt: new Date('2026-01-01'),
            }),
        ]);
        // Order only in previous period (July)
        setOrders([
            makeOrder({
                customerId: 'cus-lost',
                orderDate: new Date('2026-07-15'),
            }),
        ]);
        mockVisitFindMany.mockResolvedValue([]);

        const result = await getCustomerActivityReport(
            ADMIN_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );

        expect(result.lostCustomers).toHaveLength(1);
        expect(result.lostCustomers[0].customerId).toBe('cus-lost');
        expect(result.lostCustomers[0].previousOrderCount).toBe(1);
    });

    it('isAlsoNotVisited true when lastVisitDate is null', async () => {
        mockCustomerFindMany.mockResolvedValue([makeCustomer()]);
        setOrders([
            makeOrder({
                orderDate: new Date('2026-01-01'),
            }),
        ]);
        mockVisitFindMany.mockResolvedValue([]);

        const result = await getCustomerActivityReport(
            ADMIN_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );

        expect(result.dormantCustomers[0].isAlsoNotVisited).toBe(true);
        expect(result.dormantCustomers[0].lastVisitDate).toBeNull();
    });

    it('isAlsoNotVisited true when lastVisitDate is older than threshold', async () => {
        mockCustomerFindMany.mockResolvedValue([makeCustomer()]);
        setOrders([
            makeOrder({
                orderDate: new Date('2026-01-01'),
            }),
        ]);
        // Visit 90 days ago (older than 60-day threshold)
        const oldVisit = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        mockVisitFindMany.mockResolvedValue([
            makeVisit({ checkInTime: oldVisit }),
        ]);

        const result = await getCustomerActivityReport(
            ADMIN_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );

        expect(result.dormantCustomers[0].isAlsoNotVisited).toBe(true);
    });

    it('isAlsoNotVisited false when lastVisitDate is within threshold', async () => {
        mockCustomerFindMany.mockResolvedValue([makeCustomer()]);
        setOrders([
            makeOrder({
                orderDate: new Date('2026-01-01'),
            }),
        ]);
        // Visit 30 days ago (within 60-day threshold)
        const recentVisit = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        mockVisitFindMany.mockResolvedValue([
            makeVisit({ checkInTime: recentVisit }),
        ]);

        const result = await getCustomerActivityReport(
            ADMIN_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );

        expect(result.dormantCustomers[0].isAlsoNotVisited).toBe(false);
    });

    it('scope: sales biasa hanya lihat portofolionya (scopedCustomerWhere dipanggil)', async () => {
        const { scopedCustomerWhere } = await import(
            '@/services/sales/field-scope'
        );
        mockCustomerFindMany.mockResolvedValue([]);
        setOrders([]);
        mockVisitFindMany.mockResolvedValue([]);

        await getCustomerActivityReport(
            SALES_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );

        expect(scopedCustomerWhere).toHaveBeenCalledWith(SALES_SCOPE);
    });

    it('scope: admin/marketing melihat semua customer', async () => {
        const { scopedCustomerWhere } = await import(
            '@/services/sales/field-scope'
        );
        mockCustomerFindMany.mockResolvedValue([]);
        setOrders([]);
        mockVisitFindMany.mockResolvedValue([]);

        await getCustomerActivityReport(
            ADMIN_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );

        expect(scopedCustomerWhere).toHaveBeenCalledWith(ADMIN_SCOPE);
    });

    it('default dormant threshold is 60 days', async () => {
        vi.useFakeTimers({
            now: new Date('2026-08-31T12:00:00Z'),
        });

        // Order 61 days ago → dormant with default threshold
        const lastOrder = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000);
        mockCustomerFindMany.mockResolvedValue([makeCustomer()]);
        setOrders([makeOrder({ orderDate: lastOrder })]);
        mockVisitFindMany.mockResolvedValue([]);

        const result = await getCustomerActivityReport(ADMIN_SCOPE);
        expect(result.dormantThresholdDays).toBe(60);
        expect(result.dormantCustomers).toHaveLength(1);

        vi.useRealTimers();
    });

    it('customer with order in current period is NOT dormant', async () => {
        mockCustomerFindMany.mockResolvedValue([makeCustomer()]);
        setOrders([
            makeOrder({
                orderDate: new Date('2026-08-15'),
            }),
        ]);
        mockVisitFindMany.mockResolvedValue([]);

        const result = await getCustomerActivityReport(
            ADMIN_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );

        expect(result.dormantCustomers).toHaveLength(0);
    });

    it('dormant customer whose only order predates the previous-period window still shows the real lastOrderDate (not null)', async () => {
        const now = new Date('2026-08-31T12:00:00Z');
        vi.useFakeTimers({ now });

        // Order is from 2026-01-01 — well before previousStart (July 1),
        // so it never appears in the windowed findMany() result, only in
        // the all-time groupBy(). Without the fix this customer's
        // lastOrderDate would incorrectly be null (mistaken for "never
        // ordered") instead of showing 2026-01-01.
        const oldOrderDate = new Date('2026-01-01');
        mockCustomerFindMany.mockResolvedValue([
            makeCustomer({ id: 'cus-ancient', name: 'Ancient Order Customer' }),
        ]);
        setOrders(
            [], // nothing in the current/previous period window
            [makeOrder({ customerId: 'cus-ancient', orderDate: oldOrderDate })], // all-time
        );
        mockVisitFindMany.mockResolvedValue([]);

        const result = await getCustomerActivityReport(
            ADMIN_SCOPE,
            new Date('2026-08-01'),
            new Date('2026-08-31'),
            60,
        );

        expect(result.dormantCustomers).toHaveLength(1);
        expect(result.dormantCustomers[0].customerId).toBe('cus-ancient');
        expect(result.dormantCustomers[0].lastOrderDate).toEqual(oldOrderDate);

        vi.useRealTimers();
    });
});
