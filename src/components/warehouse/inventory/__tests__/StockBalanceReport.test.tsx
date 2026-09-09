// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockBalanceReport } from '../StockBalanceReport';
import { InventoryQuickActions } from '../InventoryQuickActions';
import { downloadCsv } from '@/lib/utils/csv-export';
import type { StockBalanceData } from '@/types/stock-balance';

vi.mock('@/lib/utils/csv-export', () => ({
    downloadCsv: vi.fn(),
    reportFilename: (name: string, dates: string) => `${name}_${dates}.csv`,
}));
const data: StockBalanceData = {
    startDate: '2026-09-01', endDate: '2026-09-09', locationId: '',
    locations: [{ id: 'L1', name: 'Gudang A' }],
    rows: [
        { productVariantId: 'A', skuCode: 'RM-A', name: 'Bahan Baku', unit: 'KG', openingStock: 1.1, totalIn: 0.2, totalOut: 1.3001, closingStock: -0.0001 },
        { productVariantId: 'B', skuCode: 'FG-B', name: 'Barang Jadi', unit: 'PCS', openingStock: 2, totalIn: 5, totalOut: 1, closingStock: 6 },
    ],
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('StockBalanceReport', () => {
    it('renders quantity columns and four decimal places without monetary fields or mixed-unit totals', () => {
        render(<StockBalanceReport data={data} />);
        expect(screen.getAllByRole('columnheader').map((node) => node.textContent)).toEqual([
            'SKU', 'Barang', 'Satuan', 'Saldo Awal', 'Masuk', 'Keluar', 'Saldo Akhir',
        ]);
        const row = screen.getByText('Bahan Baku').closest('tr')!;
        expect(within(row).getByText('-0,0001')).toBeTruthy();
        expect(screen.getByText('KG')).toBeTruthy();
        expect(screen.getByText('PCS')).toBeTruthy();
        expect(screen.queryByText(/HPP|harga|rupiah/i)).toBeNull();
        expect(screen.getByText(/Transfer internal tidak dihitung/)).toBeTruthy();
    });

    it('submits accessible GET filters with the applied period and warehouse', () => {
        render(<StockBalanceReport data={{ ...data, locationId: 'L1' }} />);
        const start = screen.getByLabelText('Tanggal awal') as HTMLInputElement;
        const end = screen.getByLabelText('Tanggal akhir') as HTMLInputElement;
        const location = screen.getByLabelText('Gudang / lokasi') as HTMLSelectElement;
        expect(start.value).toBe(data.startDate);
        expect(end.value).toBe(data.endDate);
        expect(location.value).toBe('L1');
        expect(start.form?.getAttribute('action')).toBe('/warehouse/inventory/balance');
        expect(start.form?.method).toBe('get');
        fireEvent.change(start, { target: { value: '2026-08-01' } });
        fireEvent.change(location, { target: { value: '' } });
        expect(new FormData(start.form!).get('startDate')).toBe('2026-08-01');
        expect(new FormData(start.form!).get('locationId')).toBe('');
        expect(screen.getByText(/lokasi yang dipilih/)).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Reset' }).getAttribute('href')).toBe('/warehouse/inventory/balance');
    });

    it('searches name and SKU, and exports exactly the visible rows with period context', () => {
        render(<StockBalanceReport data={data} />);
        fireEvent.change(screen.getByLabelText('Cari barang / SKU'), { target: { value: '  bahan BAKU  ' } });
        expect(screen.queryByText('Barang Jadi')).toBeNull();
        expect(screen.getByText(/1 dari 2 barang/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Ekspor CSV/ }));
        expect(downloadCsv).toHaveBeenCalledWith(
            'Neraca_Stok_2026-09-01_2026-09-09.csv',
            ['Tanggal Awal', 'Tanggal Akhir', 'Lokasi', 'SKU', 'Barang', 'Satuan', 'Saldo Awal', 'Masuk', 'Keluar', 'Saldo Akhir'],
            [['2026-09-01', '2026-09-09', 'Semua lokasi', 'RM-A', 'Bahan Baku', 'KG', 1.1, 0.2, 1.3001, -0.0001]],
        );
        fireEvent.change(screen.getByLabelText('Cari barang / SKU'), { target: { value: 'fg-b' } });
        expect(screen.getByText('Barang Jadi')).toBeTruthy();
        expect(screen.queryByText('Bahan Baku')).toBeNull();
    });

    it('exports selected warehouse and all rows when search is blank', () => {
        render(<StockBalanceReport data={{ ...data, locationId: 'L1' }} />);
        fireEvent.click(screen.getByRole('button', { name: /Ekspor CSV/ }));
        const rows = vi.mocked(downloadCsv).mock.calls[0][2];
        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row[2] === 'Gudang A')).toBe(true);
    });

    it('disables export on empty and unmatched results', () => {
        const { rerender } = render(<StockBalanceReport data={data} />);
        fireEvent.change(screen.getByLabelText('Cari barang / SKU'), { target: { value: 'unknown' } });
        expect(screen.getByText('Tidak ada barang yang cocok.')).toBeTruthy();
        expect((screen.getByRole('button', { name: /Ekspor CSV/ }) as HTMLButtonElement).disabled).toBe(true);
        rerender(<StockBalanceReport data={{ ...data, rows: [] }} />);
        expect(screen.getByText(/0 dari 0 barang/)).toBeTruthy();
    });

    it('updates filter defaults when a different report is loaded', () => {
        const { rerender } = render(<StockBalanceReport data={data} />);
        rerender(<StockBalanceReport data={{ ...data, startDate: '2026-08-01', locationId: 'L1' }} />);
        expect((screen.getByLabelText('Tanggal awal') as HTMLInputElement).value).toBe('2026-08-01');
        expect((screen.getByLabelText('Gudang / lokasi') as HTMLSelectElement).value).toBe('L1');
    });

    it('is discoverable from inventory quick actions', () => {
        render(<InventoryQuickActions lowStockCount={2} />);
        expect(screen.getByRole('link', { name: 'Neraca Stok' }).getAttribute('href')).toBe('/warehouse/inventory/balance');
    });
});
