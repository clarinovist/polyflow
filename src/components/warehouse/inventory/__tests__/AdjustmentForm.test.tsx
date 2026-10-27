// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdjustmentForm } from '../AdjustmentForm';
import { adjustStockBulk } from '@/actions/inventory/inventory';

vi.mock('@/actions/inventory/inventory', () => ({ adjustStockBulk: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/products/product-combobox', () => ({ ProductCombobox: ({ onValueChange }: { onValueChange: (id: string) => void }) => <button type="button" onClick={() => onValueChange('product')}>Pilih barang uji</button> }));
vi.mock('@/components/ui/select', () => ({
    Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => <select value={value} onChange={e => onValueChange(e.target.value)}><option value="" />{children}</select>,
    SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>, SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe('adjustment input failure', () => {
    it('preserves the item list after rejection and clears the notice after success', async () => {
        vi.mocked(adjustStockBulk).mockResolvedValueOnce({ success: false, code: 'OPERATIONAL_STOCK_COST_REQUIRED', error: 'raw', details: { skuCode: 'ATK-TEST' } }).mockResolvedValueOnce({ success: true, data: undefined });
        const view = render(<AdjustmentForm locations={[{ id: 'location', name: 'Gudang uji' }]} products={[{ id: 'product', name: 'Barang uji', skuCode: 'ATK-TEST', primaryUnit: 'PCS' }]} inventory={[]} />);
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'location' } });
        fireEvent.click(screen.getByRole('button', { name: 'Pilih barang uji' }));
        fireEvent.change(screen.getByLabelText('Jumlah penyesuaian'), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tambah ke Daftar' }));
        fireEvent.submit(view.container.querySelector('form')!);
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Harga pokok ATK belum tersedia');
        expect(alert.textContent).toContain('ATK-TEST');
        expect(screen.getByRole('button', { name: 'Hapus Barang uji' })).toBeTruthy();
        fireEvent.submit(view.container.querySelector('form')!);
        await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
        expect(vi.mocked(adjustStockBulk).mock.calls[1][0]).toEqual(vi.mocked(adjustStockBulk).mock.calls[0][0]);
    });
});
