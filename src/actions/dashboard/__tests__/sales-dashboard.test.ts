import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    guard: vi.fn(),
    entitled: vi.fn(),
    access: vi.fn(),
    scope: vi.fn(),
    revenue: vi.fn(),
    visits: vi.fn(),
    pipeline: vi.fn(),
    attention: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
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
vi.mock('@/lib/auth/sales-access', () => ({ requireSalesAccess: mocks.guard }));
vi.mock('@/lib/auth/access-policy', () => ({
    hasWorkspaceEntitlement: mocks.entitled,
}));
vi.mock('@/services/sales/sales-dashboard-service', async () => ({
    ...(await vi.importActual<object>('@/services/sales/sales-dashboard-service')),
    resolveFreshSalesDashboardAccess: mocks.access,
    resolveSalesDashboardScope: mocks.scope,
    readSalesRevenueAndOrders: mocks.revenue,
    readSalesVisitActual: mocks.visits,
    readSalesPipelineDashboard: mocks.pipeline,
    readSalesAttention: mocks.attention,
}));

import { getSalesDashboardStats } from '../sales-dashboard';

const attention = {
    state: 'AVAILABLE' as const,
    counts: {
        draftOrders: 3,
        readyToShipOrders: 2,
        readyWithoutDo: 27,
        openDeliveryOrders: 4,
        tripsToday: 1,
        overdueInvoices: 1,
        overdueAmount: 200_000,
        activeOrders: 9,
        activeCustomers: 20,
    },
    oldDrafts: { total: 3, returned: 1, items: [] },
    readyWithoutDo: { total: 27, returned: 1, items: [] },
    openDeliveries: { total: 4, returned: 1, items: [] },
    overdueInvoices: { total: 1, returned: 1, items: [] },
    creditRisk: { total: 1, returned: 1, items: [] },
    followUpsDue: { total: 2, returned: 1, items: [] },
};

function setup(role = 'ADMIN') {
    mocks.guard.mockResolvedValue({
        user: { id: 'user-1', role, roles: [role] },
    });
    mocks.entitled.mockReturnValue(true);
    mocks.access.mockResolvedValue({
        user: { id: 'user-1', role, roles: [role] },
        resources: 'ALL',
        canViewNominal: true,
    });
    mocks.scope.mockResolvedValue({
        kind:
            role === 'SALES'
                ? 'MY'
                : role === 'MARKETING'
                  ? 'TEAM'
                  : 'COMPANY',
        label:
            role === 'SALES'
                ? 'Portofolio saya'
                : role === 'MARKETING'
                  ? 'Tim sales aktif'
                  : 'Seluruh perusahaan',
        actorUserId: 'user-1',
        fieldScope: { actorUserId: 'user-1', isGlobalViewer: role !== 'SALES' },
    });
    mocks.revenue.mockResolvedValue({
        orderActual: 12,
        revenueActual: 1_000_000,
        revenueTrend: Array.from({ length: 6 }, (_, index) => ({
            month: '2026-' + String(index + 1).padStart(2, '0'),
            revenue: (index + 1) * 100_000,
        })),
    });
    mocks.visits.mockResolvedValue(8);
    mocks.pipeline.mockResolvedValue({
        activeCount: 5,
        activeValue: 700_000,
        topLostReason: {
            reason: 'PRICE',
            label: 'Harga',
            count: 3,
            totalValue: 250_000,
        },
    });
    mocks.attention.mockResolvedValue(attention);
}

describe('getSalesDashboardStats R4A', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setup();
    });

    it('returns canonical Health, Attention, and Drivers with target withheld', async () => {
        const result = await getSalesDashboardStats();

        expect(result.success).toBe(true);
        if (!result.success || !result.data || result.data.state !== 'AVAILABLE') return;
        expect(result.data.health.revenue).toEqual({
            state: 'AVAILABLE',
            value: 1_000_000,
            targetState: 'NOT_CONFIGURED',
        });
        expect(result.data.health.orders.value).toBe(12);
        expect(result.data.health.visits.value).toBe(8);
        expect(result.data.health.pipeline).toMatchObject({
            state: 'AVAILABLE',
            count: 5,
            value: 700_000,
        });
        expect(result.data.attention?.readyWithoutDo?.total).toBe(27);
        expect(result.data.drivers.revenueTrend).toMatchObject({
            state: 'AVAILABLE',
        });
        expect(result.data.drivers.revenueTrend.points).toHaveLength(6);
        expect(result.data.drivers.topLostReason.value?.label).toBe('Harga');
    });

    it('filters links on the server and does not widen a narrow resource grant', async () => {
        mocks.access.mockResolvedValue({
            user: { id: 'user-1', role: 'SALES', roles: ['SALES'] },
            resources: ['/sales/orders'],
            canViewNominal: true,
        });

        const result = await getSalesDashboardStats();

        expect(result.success).toBe(true);
        if (!result.success || !result.data || result.data.state !== 'AVAILABLE') return;
        expect(result.data.permissions.links.orders).toBe('/sales/orders');
        expect(result.data.permissions.links.pipeline).toBeNull();
        expect(result.data.permissions.links.performance).toBeNull();
        expect(result.data.permissions.links.fieldSales).toBeNull();
        expect(result.data.health.visits.state).toBe('HIDDEN');
        expect(result.data.health.pipeline.state).toBe('HIDDEN');
        expect(mocks.visits).not.toHaveBeenCalled();
        expect(mocks.pipeline).not.toHaveBeenCalled();
        expect(mocks.attention).toHaveBeenCalledWith(
            expect.anything(),
            expect.any(Date),
            true,
            {
                orders: true,
                deliveries: false,
                deliverySchedules: false,
                invoices: false,
                customers: false,
            },
        );
    });

    it('uses team scope for MARKETING actuals but global operational scope for pipeline and Attention', async () => {
        setup('MARKETING');

        const result = await getSalesDashboardStats();

        expect(result.success).toBe(true);
        if (!result.success || !result.data || result.data.state !== 'AVAILABLE') return;
        expect(result.data.scope).toEqual({
            kind: 'TEAM',
            label: 'Tim sales aktif',
            operationalLabel: 'Seluruh operasi Sales',
        });
        expect(mocks.revenue).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'TEAM' }),
            expect.anything(),
            true,
        );
        expect(mocks.pipeline).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'COMPANY',
                fieldScope: expect.objectContaining({ isGlobalViewer: true }),
            }),
            expect.anything(),
            true,
        );
        expect(mocks.attention).toHaveBeenCalledWith(
            expect.objectContaining({ kind: 'COMPANY' }),
            expect.any(Date),
            true,
            expect.anything(),
        );
    });

    it('removes every nominal value from the payload without price capability', async () => {
        mocks.access.mockResolvedValue({
            user: { id: 'user-1', role: 'ADMIN', roles: ['ADMIN'] },
            resources: 'ALL',
            canViewNominal: false,
        });
        mocks.revenue.mockResolvedValue({
            orderActual: 12,
            revenueActual: null,
            revenueTrend: [],
        });
        mocks.pipeline.mockResolvedValue({
            activeCount: 5,
            activeValue: null,
            topLostReason: {
                reason: 'PRICE',
                label: 'Harga',
                count: 3,
                totalValue: null,
            },
        });
        mocks.attention.mockResolvedValue({
            ...attention,
            counts: { ...attention.counts, overdueAmount: null },
        });

        const result = await getSalesDashboardStats();

        expect(result.success).toBe(true);
        if (!result.success || !result.data || result.data.state !== 'AVAILABLE') return;
        expect(result.data.health.revenue.state).toBe('HIDDEN');
        expect(result.data.health.revenue.value).toBeNull();
        expect(result.data.health.pipeline.value).toBeNull();
        expect(result.data.drivers.revenueTrend).toEqual({
            state: 'HIDDEN',
            points: [],
        });
        expect(result.data.drivers.topLostReason.value?.totalValue).toBeNull();
        expect(result.data.attention?.counts.overdueAmount).toBeNull();
    });

    it('marks a failed pipeline driver UNAVAILABLE instead of not configured', async () => {
        mocks.pipeline.mockRejectedValue(new Error('pipeline unavailable'));

        const result = await getSalesDashboardStats();

        expect(result.success).toBe(true);
        if (!result.success || !result.data || result.data.state !== 'AVAILABLE') return;
        expect(result.data.health.pipeline.state).toBe('UNAVAILABLE');
        expect(result.data.drivers.topLostReason).toEqual({
            state: 'UNAVAILABLE',
            value: null,
        });
        expect(result.data.drivers.revenueTrend.state).toBe('AVAILABLE');
    });

    it('keeps independent sections useful when one reader fails', async () => {
        mocks.revenue.mockRejectedValue(new Error('revenue unavailable'));

        const result = await getSalesDashboardStats();

        expect(result.success).toBe(true);
        if (!result.success || !result.data || result.data.state !== 'AVAILABLE') return;
        expect(result.data.health.revenue.state).toBe('UNAVAILABLE');
        expect(result.data.health.orders.state).toBe('UNAVAILABLE');
        expect(result.data.drivers.revenueTrend).toEqual({
            state: 'UNAVAILABLE',
            points: [],
        });
        expect(result.data.health.visits.value).toBe(8);
        expect(result.data.health.pipeline.count).toBe(5);
        expect(result.data.attention?.counts.draftOrders).toBe(3);
    });

    it('fails closed when fresh database roles have revoked Sales access despite a stale session role', async () => {
        mocks.access.mockRejectedValue(
            new Error('Unauthorized: fresh role revoked'),
        );

        const result = await getSalesDashboardStats();

        expect(result).toMatchObject({
            success: false,
            error: 'Unauthorized: fresh role revoked',
        });
        expect(mocks.scope).not.toHaveBeenCalled();
        expect(mocks.revenue).not.toHaveBeenCalled();
        expect(mocks.attention).not.toHaveBeenCalled();
    });

    it('does not query any dashboard reader when Sales module is inactive', async () => {
        mocks.entitled.mockReturnValue(false);

        const result = await getSalesDashboardStats();

        expect(result.success).toBe(true);
        if (!result.success || !result.data) return;
        expect(result.data.state).toBe('HIDDEN');
        expect(mocks.scope).not.toHaveBeenCalled();
        expect(mocks.revenue).not.toHaveBeenCalled();
        expect(mocks.attention).not.toHaveBeenCalled();
    });

    it('enforces the Sales role guard before entitlement or data reads', async () => {
        mocks.guard.mockRejectedValue(new Error('Unauthorized'));

        const result = await getSalesDashboardStats();

        expect(result).toMatchObject({ success: false, error: 'Unauthorized' });
        expect(mocks.entitled).not.toHaveBeenCalled();
        expect(mocks.scope).not.toHaveBeenCalled();
    });
});
