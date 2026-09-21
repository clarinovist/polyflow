// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransferForm } from '../TransferForm';
import { AdjustmentForm } from '../AdjustmentForm';
import { transferStockBulk, adjustStockBulk } from '@/actions/inventory/inventory';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/actions/inventory/inventory', () => ({ transferStockBulk: vi.fn(), adjustStockBulk: vi.fn() }));
vi.mock('@/components/products/product-combobox', () => ({ ProductCombobox: ({ value, onValueChange, products }: { value: string; onValueChange: (id: string) => void; products: { id: string; name: string }[] }) => <select aria-label="Produk" value={value} onChange={(event) => onValueChange(event.target.value)}><option value="">Pilih produk</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select> }));
vi.mock('@/components/ui/select', () => ({
    Select: ({ value, onValueChange, children }: { value: string; onValueChange: (id: string) => void; children: ReactNode }) => <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
    SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children, disabled }: { value: string; children: ReactNode; disabled?: boolean }) => <option value={value} disabled={disabled}>{children}</option>,
}));
const props = {
    locations: [{ id: 'a', name: 'Lokasi A' }, { id: 'b', name: 'Lokasi B' }],
    products: [{ id: 'p', name: 'Barang Uji', skuCode: 'SYN', primaryUnit: 'KG' }],
    inventory: [{ productVariantId: 'p', locationId: 'a', quantity: 100 }],
};
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('stock forms keep drafts and server payload contracts', () => {
    it('transfer adds locally, confirms before discarding source draft, preserves draft on rejection', async () => {
        vi.mocked(transferStockBulk).mockResolvedValue({ success: false, error: 'Konflik stok', code: 'BUSINESS_RULE' });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<TransferForm {...props} />);
        const [source, destination] = screen.getAllByRole('combobox');
        fireEvent.change(source, { target: { value: 'a' } });
        fireEvent.change(destination, { target: { value: 'b' } });
        fireEvent.change(screen.getByLabelText('Produk'), { target: { value: 'p' } });
        fireEvent.change(screen.getByLabelText('Jumlah transfer'), { target: { value: '12' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tambah ke Daftar' }));
        expect(transferStockBulk).not.toHaveBeenCalled();
        expect(screen.getByText('12 KG')).toBeTruthy();
        fireEvent.change(source, { target: { value: 'b' } });
        expect(confirm).toHaveBeenCalled();
        expect((source as HTMLSelectElement).value).toBe('a');
        expect(screen.getByText('12 KG')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Transfer' }));
        await waitFor(() => expect(transferStockBulk).toHaveBeenCalledWith(expect.objectContaining({ sourceLocationId: 'a', destinationLocationId: 'b', items: [{ productVariantId: 'p', quantity: 12 }] })));
        expect(screen.getByText('12 KG')).toBeTruthy();
        confirm.mockReturnValue(true);
        fireEvent.change(source, { target: { value: 'b' } });
        expect(screen.queryByText('12 KG')).toBeNull();
    });
    it('adjustment preserves explicit IN default/fallback reason and requires confirmation to discard', async () => {
        vi.mocked(adjustStockBulk).mockResolvedValue({ success: false, error: 'Konflik', code: 'BUSINESS_RULE' });
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<AdjustmentForm {...props} />);
        const location = screen.getAllByRole('combobox')[0];
        fireEvent.change(location, { target: { value: 'a' } });
        fireEvent.change(screen.getByLabelText('Produk'), { target: { value: 'p' } });
        fireEvent.change(screen.getByLabelText('Jumlah penyesuaian'), { target: { value: '5' } });
        fireEvent.click(screen.getByRole('button', { name: 'Tambah ke Daftar' }));
        expect(adjustStockBulk).not.toHaveBeenCalled();
        expect(screen.getByText('5 KG')).toBeTruthy();
        fireEvent.change(location, { target: { value: 'b' } });
        expect((location as HTMLSelectElement).value).toBe('a');
        const submit = screen.getAllByRole('button').find((button) => button.getAttribute('type') === 'submit')!;
        fireEvent.click(submit);
        await waitFor(() => expect(adjustStockBulk).toHaveBeenCalledWith(expect.objectContaining({ locationId: 'a', items: [expect.objectContaining({ quantity: 5, type: 'ADJUSTMENT_IN', reason: 'Penyesuaian Stok' })] })));
        expect(screen.getByText('5 KG')).toBeTruthy();
    });
});
