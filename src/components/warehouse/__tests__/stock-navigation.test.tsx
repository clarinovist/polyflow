// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockLedgerClient } from '../StockLedgerClient';
import { ProductMovementsTab } from '../360/ProductMovementsTab';
const mocks = vi.hoisted(() => ({ query: 'tab=ledger&locationId=loc-a&startDate=2026-09-01', push: vi.fn(), movements: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.query), useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/actions/inventory/product-360', () => ({ listRecentMovementsByProductVariant: mocks.movements }));
vi.mock('@/components/common/transaction-date-filter', () => ({ TransactionDateFilter: ({ onDateChange }: { onDateChange: (range: { from: Date; to: Date }) => void }) => <button onClick={() => onDateChange({ from: new Date('2026-08-01T12:00:00'), to: new Date('2026-08-31T12:00:00') })}>Ubah periode</button> }));
const ledger = { product: { id: 'p', name: 'Produk Uji', skuCode: 'SYN', primaryUnit: 'KG', type: 'RAW_MATERIAL' }, entries: [], summary: { openingStock: 0, totalIn: 0, totalOut: 0, closingStock: 0 } };
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
describe('stock read navigation', () => {
    it('keeps the ledger tab and location on date change, resets only ledger filters', () => {
        render(<StockLedgerClient ledgerData={ledger} locations={[{ id: 'loc-a', name: 'Lokasi A' }]} embedded />);
        expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
        expect(screen.getByRole('heading', { name: 'Kartu Stok' })).toBeTruthy();
        fireEvent.click(screen.getByText('Ubah periode'));
        const next = new URL(mocks.push.mock.calls[0][0], 'http://fixture.test');
        expect(next.searchParams.get('tab')).toBe('ledger');
        expect(next.searchParams.get('locationId')).toBe('loc-a');
        expect(next.searchParams.get('startDate')).toBe('2026-08-01');
        fireEvent.click(screen.getByText('Reset'));
        expect(mocks.push).toHaveBeenLastCalledWith('/warehouse/inventory/p?tab=ledger');
    });
    it('distinguishes movement loading, failure, retry and empty', async () => {
        mocks.movements.mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: true, data: [] });
        render(<ProductMovementsTab productVariantId="p" />);
        expect(screen.getByText('Memuat…')).toBeTruthy();
        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
        expect(screen.queryByText('Tidak ada mutasi.')).toBeNull();
        fireEvent.click(screen.getByText('Coba lagi'));
        await waitFor(() => expect(screen.getByText('Tidak ada mutasi.')).toBeTruthy());
        expect(screen.getByText(/Maksimal 50/)).toBeTruthy();
    });
});
