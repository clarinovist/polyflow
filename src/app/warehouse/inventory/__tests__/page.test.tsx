// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryTableProps } from '@/components/warehouse/inventory/inventory-table-types';
import { stockItem } from '@/components/warehouse/inventory/__tests__/inventory-fixtures';
const mocks = vi.hoisted(() => ({ stats: vi.fn(), locations: vi.fn(), dashboard: vi.fn(), history: vi.fn(), prices: vi.fn(), abc: vi.fn(), table: vi.fn() }));
vi.mock('@/actions/inventory/inventory', () => ({ getInventoryStats: mocks.stats, getLocations: mocks.locations, getDashboardStats: mocks.dashboard, getInventoryAsOf: mocks.history }));
vi.mock('@/actions/admin/permissions', () => ({ canViewPrices: mocks.prices }));
vi.mock('@/services/inventory/abc-analysis-service', () => ({ ABCAnalysisService: { calculateABCClassification: mocks.abc } }));
vi.mock('@/lib/core/tenant', () => ({ withTenantPage: (fn: unknown) => fn }));
vi.mock('@/components/support/contextual-help', () => ({ ContextualHelp: () => null }));
vi.mock('@/components/warehouse/inventory/WarehouseNavigator', () => ({ WarehouseNavigator: () => null }));
vi.mock('@/components/warehouse/inventory/InventoryQuickActions', () => ({ InventoryQuickActions: () => null }));
vi.mock('@/components/warehouse/inventory/InventoryTable', () => ({ InventoryTable: (props: InventoryTableProps) => { mocks.table(props); return props.dataError ? <p role="alert">{props.dataError}</p> : <div>table</div>; } }));
import Page from '../page';
beforeEach(() => {
    vi.clearAllMocks();
    mocks.stats.mockResolvedValue({ success: true, data: [stockItem] });
    mocks.locations.mockResolvedValue({ success: true, data: [stockItem.location] });
    mocks.dashboard.mockResolvedValue({ success: true, data: { totalStock: 100, totalValue: 250000, lowStockCount: 0 } });
    mocks.prices.mockResolvedValue({ success: true, data: true });
    mocks.abc.mockResolvedValue([]);
    mocks.history.mockResolvedValue({ success: true, data: [{ productVariantId: 'product-a', locationId: 'loc-a', quantity: 42 }] });
});
afterEach(cleanup);
const tableProps = () => mocks.table.mock.calls.at(-1)![0] as InventoryTableProps;
describe('stock page historical boundary', () => {
    it('uses only reconstructed quantity and removes live availability, cost and ABC', async () => {
        render(await Page({ searchParams: Promise.resolve({ asOf: '2026-09-01', locationId: ['loc-a', 'loc-b'] }) }));
        expect(mocks.history).toHaveBeenCalledWith(new Date('2026-09-01T00:00:00Z'));
        expect(tableProps().inventory[0]).toMatchObject({ quantity: 42, averageCost: null });
        expect(tableProps().inventory[0].reservedQuantity).toBeUndefined();
        expect(tableProps().inventory[0].availableQuantity).toBeUndefined();
        expect(tableProps().totalValue).toBeUndefined();
        expect(tableProps().abcMap).toBeUndefined();
        expect(mocks.abc).not.toHaveBeenCalled();
    });
    it('does not disguise historical failure as zero inventory', async () => {
        mocks.history.mockResolvedValue({ success: false });
        render(await Page({ searchParams: Promise.resolve({ asOf: '2026-09-01' }) }));
        expect(screen.getByRole('alert').textContent).toContain('historis');
        expect(tableProps().inventory).toEqual([]);
    });
    it('suppresses failed comparison deltas', async () => {
        mocks.history.mockResolvedValue({ success: false });
        render(await Page({ searchParams: Promise.resolve({ compareWith: '2026-09-01' }) }));
        expect(tableProps().showComparison).toBe(false);
        expect(tableProps().comparisonError).toBeTruthy();
    });
    it('does not query invalid dates or fallback to live stock', async () => {
        render(await Page({ searchParams: Promise.resolve({ asOf: '2026-02-30' }) }));
        expect(mocks.history).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toContain('tidak valid');
    });
    it('hides values for non-price role while retaining live quantity', async () => {
        mocks.prices.mockResolvedValue({ success: true, data: false });
        render(await Page({ searchParams: Promise.resolve({}) }));
        expect(tableProps().showPrices).toBe(false);
        expect(tableProps().totalValue).toBeUndefined();
        expect(tableProps().customerOwnedValue).toBeUndefined();
        expect(tableProps().inventory[0].quantity).toBe(100);
    });
});
