// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, calculateStockAging, getAgingSummary, agingTable } = vi.hoisted(
    () => ({
        auth: vi.fn(),
        calculateStockAging: vi.fn(),
        getAgingSummary: vi.fn(),
        agingTable: vi.fn(),
    }),
);

vi.mock('@/auth', () => ({ auth }));
vi.mock('@/lib/core/tenant', () => ({ withTenantPage: (fn: unknown) => fn }));
vi.mock('@/services/inventory/stock-aging-service', () => ({
    StockAgingService: { calculateStockAging, getAgingSummary },
}));
vi.mock('@/components/warehouse/inventory/StockAgingTable', () => ({
    StockAgingTable: (props: unknown) => {
        agingTable(props);
        return <div data-testid="aging-table" />;
    },
}));

import StockAgingPage from '../page';

const bucket = (range: string, quantity: number, value: number) => ({
    range,
    count: 1,
    quantity,
    value,
});
const agingRow = {
    productVariantId: 'v-1',
    name: 'Resin',
    skuCode: 'RSN-1',
    totalStock: 30,
    buckets: {
        '0-30': bucket('0-30', 10, 1_111_000),
        '31-60': bucket('31-60', 10, 2_222_000),
        '61-90': bucket('61-90', 5, 3_333_000),
        '90+': bucket('90+', 5, 4_444_000),
    },
};

const tableProps = () =>
    agingTable.mock.calls.at(-1)![0] as {
        data: Array<typeof agingRow>;
        showPrices?: boolean;
    };

beforeEach(() => {
    vi.clearAllMocks();
    calculateStockAging.mockResolvedValue([agingRow]);
    getAgingSummary.mockResolvedValue({
        totalItems: 1,
        totalValue: 11_110_000,
        slowMovingCount: 1,
        avgDays: 42,
    });
});
afterEach(cleanup);

describe('stock aging page price visibility', () => {
    it('hides Total Nilai and zeroes bucket values for Kepala Pabrik without ADMIN', async () => {
        auth.mockResolvedValue({
            user: { role: 'FACTORY_MANAGER', roles: ['FACTORY_MANAGER'] },
        });

        render(await StockAgingPage());

        expect(screen.queryByText('Total Nilai')).toBeNull();
        expect(screen.queryByText(/Rp/)).toBeNull();
        expect(tableProps().showPrices).toBe(false);
        const buckets = tableProps().data[0].buckets;
        expect(Object.values(buckets).map((b) => b.value)).toEqual([0, 0, 0, 0]);
        expect(buckets['90+'].quantity).toBe(5);
        expect(JSON.stringify(tableProps().data)).not.toContain('1111000');
    });

    it.each([
        ['ADMIN', ['ADMIN']],
        ['WAREHOUSE', ['WAREHOUSE']],
        ['PLANNING', ['PLANNING']],
        ['FACTORY_MANAGER with ADMIN', ['FACTORY_MANAGER', 'ADMIN']],
    ])('keeps values for %s', async (_label, roles) => {
        auth.mockResolvedValue({ user: { role: roles[0], roles } });

        render(await StockAgingPage());

        expect(screen.getByText('Total Nilai')).toBeTruthy();
        expect(tableProps().showPrices).toBe(true);
        expect(tableProps().data[0].buckets['0-30'].value).toBe(1_111_000);
    });
});
