// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryTable } from '../InventoryTable';
import { stockItem } from './inventory-fixtures';
import { downloadCsv } from '@/lib/utils/csv-export';
vi.mock('@/lib/utils/csv-export', () => ({ downloadCsv: vi.fn(), reportFilename: (name: string, date: string) => `${name}_${date}.csv` }));
const nav = vi.hoisted(() => ({ query: '', push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.query), useRouter: () => nav }));
vi.mock('../ThresholdDialog', () => ({ ThresholdDialog: () => <button>Ambang stok</button> }));
vi.mock('../BulkAdjustDialog', () => ({ BulkAdjustDialog: () => null }));
vi.mock('../BulkTransferDialog', () => ({ BulkTransferDialog: () => null }));
afterEach(cleanup);
beforeEach(() => { nav.query = ''; vi.clearAllMocks(); });
const props = { inventory: [stockItem], variantTotals: { 'product-a': 100 }, totalValue: 250000, customerOwnedValue: 50000 };
describe('InventoryTable', () => {
    it('exports historical context without claiming current availability', () => {
        render(<InventoryTable {...props} initialDate="2026-09-01" />);
        fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
        expect(vi.mocked(downloadCsv).mock.calls[0][2][0][0]).toContain('2026-09-01 00:00 UTC');
        expect(vi.mocked(downloadCsv).mock.calls[0][2][0].at(-1)).toBe('Historis; ambang master terkini');
    });
    it.each(['', 'locationId=loc-a&locationId=loc-b'])('shows location identity for all/multi: %s', (query) => {
        nav.query = query;
        render(<InventoryTable {...props} />);
        expect(screen.getByRole('columnheader', { name: 'Lokasi' })).toBeTruthy();
    });
    it('only hides location column when precisely one unique location is selected', () => {
        nav.query = 'locationId=loc-a&locationId=loc-a';
        render(<InventoryTable {...props} />);
        expect(screen.queryByRole('columnheader', { name: 'Lokasi' })).toBeNull();
    });
    it('historical mode does not expose current reservations, value, ABC, or mutation selection', () => {
        render(<InventoryTable {...props} initialDate="2026-09-01" showPrices />);
        expect(screen.getByRole('note').textContent).toContain('bukan saldo akhir hari');
        expect(screen.queryByText('nilai internal')).toBeNull();
        expect(screen.queryByRole('columnheader', { name: 'Biaya Per Unit' })).toBeNull();
        expect(screen.queryByText(/menunggu reservasi/)).toBeNull();
        expect(screen.queryByText('Ambang stok')).toBeNull();
        expect(screen.getAllByRole('checkbox').every((element) => element.hasAttribute('disabled'))).toBe(true);
    });
    it('keeps location and low-stock context when returning live', () => {
        nav.query = 'asOf=2026-09-01&compareWith=2026-08-01&locationId=loc-a&locationId=loc-b&lowStock=true';
        render(<InventoryTable {...props} initialDate="2026-09-01" />);
        fireEvent.click(screen.getByRole('button', { name: 'Kembali ke stok saat ini' }));
        const query = new URLSearchParams(nav.push.mock.calls[0][0]);
        expect(query.getAll('locationId')).toEqual(['loc-a', 'loc-b']);
        expect(query.has('asOf')).toBe(false);
        expect(query.has('compareWith')).toBe(false);
        expect(query.get('lowStock')).toBe('true');
    });
    it('shows failure instead of empty stock, disables export, and retries', () => {
        render(<InventoryTable {...props} inventory={[]} dataError="Gagal stok" />);
        expect(screen.getByRole('alert').textContent).toContain('Gagal stok');
        expect(screen.queryByText('Belum ada stok tercatat.')).toBeNull();
        expect((screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(nav.refresh).toHaveBeenCalled();
    });
    it('separates totals by unit and guards money for non-price role', () => {
        render(<InventoryTable {...props} inventory={[stockItem, { ...stockItem, id: 'inv-b', productVariant: { ...stockItem.productVariant, primaryUnit: 'PCS' }, quantity: 8 }]} />);
        expect(screen.getAllByText('100 KG').length).toBeGreaterThan(0);
        expect(screen.getAllByText('8 PCS').length).toBeGreaterThan(0);
        expect(screen.queryByText('nilai internal')).toBeNull();
    });
});
