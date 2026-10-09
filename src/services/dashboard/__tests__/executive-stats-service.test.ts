import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    sales: vi.fn(),
    purchasing: vi.fn(),
    finance: vi.fn(),
    production: vi.fn(),
    inventory: vi.fn(),
}));

vi.mock('@/services/sales/executive-metrics-service', () => ({
    getExecutiveSalesMetrics: mocks.sales,
}));
vi.mock('@/services/purchasing/executive-metrics-service', () => ({
    getExecutivePurchasingMetrics: mocks.purchasing,
}));
vi.mock('@/services/finance/executive-metrics-service', () => ({
    getExecutiveFinanceMetrics: mocks.finance,
}));
vi.mock('@/services/production/executive-metrics-service', () => ({
    getExecutiveProductionMetrics: mocks.production,
}));
vi.mock('@/services/inventory/query-service', () => ({
    InventoryQueryService: { getExecutiveMetrics: mocks.inventory },
}));

import { ExecutiveStatsService } from '../executive-stats-service';

const finance = {
    mtdRevenue: 900,
    revenueTrend: 80,
    mtdNetIncome: 540,
    netIncomeTrend: 35,
    mtdSpending: 250,
    spendingTrend: 25,
    cashBalance: 1_500,
    cashAsOfDate: '2026-05-31',
    pendingInvoices: 4,
    overdueReceivables: 650,
    overdueReceivablesCount: 3,
    overduePayables: 500,
    overduePayablesCount: 2,
    invoicesDueThisWeek: 2,
    revenueTrendChart: [
        { month: '2026-04', revenue: 500 },
        { month: '2026-05', revenue: 900 },
    ],
    netIncomeTrendChart: [
        { month: '2026-04', netIncome: 400 },
        { month: '2026-05', netIncome: 540 },
    ],
};
const production = {
    activeJobs: 5,
    delayedJobs: 2,
    completionRate: 50,
    totalScrap: null,
    scrapStatus: 'NOT_CONFIGURED' as const,
    downtimeHours: 1.5,
    runningMachines: 2,
    totalMachines: 6,
    trend: -50,
};
const inventory = {
    totalValue: null,
    valuationStatus: 'NOT_CONFIGURED' as const,
    lowStockCount: 1,
    totalItems: 12,
};

describe('ExecutiveStatsService.getExecutiveStats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.sales.mockResolvedValue({ activeOrders: 1 });
        mocks.purchasing.mockResolvedValue({ pendingPOs: 3 });
        mocks.finance.mockResolvedValue(finance);
        mocks.production.mockResolvedValue(production);
        mocks.inventory.mockResolvedValue(inventory);
    });

    it('composes domain metrics and generates the server snapshot timestamp', async () => {
        const before = Date.now();
        const stats = await ExecutiveStatsService.getExecutiveStats();

        expect(stats).toMatchObject({
            sections: {
                sales: 'AVAILABLE',
                purchasing: 'AVAILABLE',
                production: 'AVAILABLE',
                inventory: 'AVAILABLE',
                finance: 'AVAILABLE',
            },
            sales: {
                activeOrders: 1,
                mtdRevenue: 900,
                pendingInvoices: 4,
                overdueReceivables: 650,
            },
            purchasing: {
                pendingPOs: 3,
                mtdSpending: 250,
                overduePayables: 500,
            },
            production,
            inventory,
            finance,
        });
        expect(new Date(stats.generatedAt).getTime()).toBeGreaterThanOrEqual(before);
        expect(mocks.finance).toHaveBeenCalledWith(expect.any(Date), {
            includeBalanceSheet: true,
        });
    });

    it('marks one failed domain unavailable without replacing it with zeros', async () => {
        mocks.production.mockRejectedValueOnce(new Error('synthetic unavailable'));

        const stats = await ExecutiveStatsService.getExecutiveStats();

        expect(stats.sections.production).toBe('UNAVAILABLE');
        expect(stats.production).toBeNull();
        expect(stats.sections.sales).toBe('AVAILABLE');
        expect(stats.sales?.mtdRevenue).toBe(900);
    });

    it('does not request or return hidden and inactive sections', async () => {
        const stats = await ExecutiveStatsService.getExecutiveStats({
            sections: ['production', 'inventory', 'finance'],
            activeModules: ['CORE', 'PRODUCTION', 'INVENTORY'],
        });

        expect(stats.sections).toEqual({
            sales: 'HIDDEN',
            purchasing: 'HIDDEN',
            production: 'AVAILABLE',
            inventory: 'AVAILABLE',
            finance: 'HIDDEN',
        });
        expect(stats.sales).toBeNull();
        expect(stats.purchasing).toBeNull();
        expect(stats.finance).toBeNull();
        expect(mocks.sales).not.toHaveBeenCalled();
        expect(mocks.purchasing).not.toHaveBeenCalled();
        expect(mocks.finance).not.toHaveBeenCalled();
    });

    it('keeps operational Sales and Purchasing available when Finance fails', async () => {
        mocks.finance.mockRejectedValueOnce(new Error('finance unavailable'));

        const stats = await ExecutiveStatsService.getExecutiveStats({
            sections: ['sales', 'purchasing', 'finance'],
        });

        expect(stats.sections).toMatchObject({
            sales: 'AVAILABLE',
            purchasing: 'AVAILABLE',
            finance: 'UNAVAILABLE',
        });
        expect(stats.sales).toMatchObject({
            activeOrders: 1,
            mtdRevenue: null,
            pendingInvoices: null,
            revenueTrendChart: [],
        });
        expect(stats.purchasing).toMatchObject({
            pendingPOs: 3,
            mtdSpending: null,
            overduePayables: null,
        });
        expect(stats.finance).toBeNull();
        expect(mocks.finance).toHaveBeenCalledWith(expect.any(Date), {
            includeBalanceSheet: true,
        });
    });

    it('does not query an inactive Finance module even when Sales is visible', async () => {
        const stats = await ExecutiveStatsService.getExecutiveStats({
            sections: ['sales', 'finance'],
            activeModules: ['SALES'],
        });

        expect(stats.sections).toMatchObject({
            sales: 'AVAILABLE',
            finance: 'HIDDEN',
        });
        expect(stats.sales).toMatchObject({
            activeOrders: 1,
            mtdRevenue: null,
            pendingInvoices: null,
        });
        expect(mocks.finance).not.toHaveBeenCalled();
    });

    it('withholds the Finance section and skips its balance-sheet option when only Sales needs revenue', async () => {
        const stats = await ExecutiveStatsService.getExecutiveStats({
            sections: ['sales', 'inventory'],
        });

        expect(stats.sections).toMatchObject({
            sales: 'AVAILABLE',
            inventory: 'AVAILABLE',
            finance: 'HIDDEN',
        });
        expect(stats.sales).toMatchObject({
            activeOrders: 1,
            mtdRevenue: 900,
            pendingInvoices: 4,
        });
        expect(stats.finance).toBeNull();
        expect(mocks.finance).toHaveBeenCalledWith(expect.any(Date), {
            includeBalanceSheet: false,
        });
    });
});
