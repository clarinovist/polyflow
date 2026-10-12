// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InventoryMobileCards } from '../InventoryMobileCards';
import { InventoryDesktopTable } from '../InventoryDesktopTable';
import { WarehouseNavigator } from '../WarehouseNavigator';
import { stockItem, stockLocations } from './inventory-fixtures';
import { formatQuantity } from '@/lib/utils/utils';

vi.mock('../ThresholdDialog', () => ({ ThresholdDialog: () => <button>Ambang stok</button> }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('asOf=2026-09-01&compareWith=2026-08-01&lowStock=true&locationId=loc-a'), useRouter: () => ({ push: vi.fn() }) }));
afterEach(cleanup);
const common = { variantTotals: { 'product-a': 100 }, selectedItems: new Set<string>(), toggleSelectItem: vi.fn(), isGlobalLowStock: () => false };
describe('inventory display contract', () => {
    it.each([0, 14, -2, null, undefined])('preserves available quantity %s on desktop and mobile', (availableQuantity) => {
        const item = { ...stockItem, availableQuantity: availableQuantity as number | undefined };
        const expected = formatQuantity(availableQuantity ?? item.quantity);
        const mobile = render(<InventoryMobileCards {...common} paginatedInventory={[item]} />);
        const available = screen.getAllByText('Tersedia').at(-1)!;
        expect(available.nextElementSibling?.textContent?.trim()).toBe(expected);
        mobile.unmount();
        render(<InventoryDesktopTable {...common} paginatedInventory={[item]} processedInventoryCount={1} isLocationSpecific={false} showPrices={false} isAllSelected={false} isSomeSelected={false} sortField="stock" sortOrder="desc" toggleSelectAll={vi.fn()} handleSort={vi.fn()} />);
        const row = screen.getAllByRole('row')[1];
        expect(within(row).getAllByRole('cell')[5].textContent).toContain(expected);
    });
    it.each(['desktop', 'mobile'])('formats low-stock totals without floating-point artifacts on %s', (view) => {
        const item = {
            ...stockItem,
            productVariant: {
                ...stockItem.productVariant,
                minStockAlert: 100,
            },
        };
        const props = {
            ...common,
            variantTotals: { 'product-a': 50.8 + 16.0508 },
            isGlobalLowStock: () => true,
            paginatedInventory: [item],
        };

        if (view === 'mobile') {
            render(<InventoryMobileCards {...props} />);
        } else {
            render(
                <InventoryDesktopTable
                    {...props}
                    processedInventoryCount={1}
                    isLocationSpecific={false}
                    showPrices={false}
                    isAllSelected={false}
                    isSomeSelected={false}
                    sortField="stock"
                    sortOrder="desc"
                    toggleSelectAll={vi.fn()}
                    handleSort={vi.fn()}
                />,
            );
        }

        const lowStock = Array.from(
            document.querySelectorAll('[data-slot=badge], td div'),
        ).find((element) =>
            element.textContent?.includes('66,8508/100'),
        );
        expect(lowStock?.textContent).toContain('66,8508/100');
        expect(document.body.textContent).not.toContain('66.85079999999999');
    });

    it('preserves all non-location query parameters in location links', () => {
        render(<WarehouseNavigator locations={stockLocations} activeLocationIds={['loc-a']} totalSkus={2} totalLowStock={0} />);
        for (const name of [/Semua Lokasi/, /Lokasi B/]) {
            const link = screen.getAllByRole('link', { name })[0];
            const url = new URL(link.getAttribute('href')!, 'http://fixture.test');
            expect(url.searchParams.get('asOf')).toBe('2026-09-01');
            expect(url.searchParams.get('compareWith')).toBe('2026-08-01');
            expect(url.searchParams.get('lowStock')).toBe('true');
        }
    });
});
