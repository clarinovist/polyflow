// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkAdjustDialog } from '../BulkAdjustDialog';
import { stockItem } from './inventory-fixtures';
import { adjustStockBulk } from '@/actions/inventory/inventory';

vi.mock('@/actions/inventory/inventory', () => ({ adjustStockBulk: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
describe('BulkAdjustDialog draft', () => {
    it('keeps a transport failure visible and does not claim an unsaved transaction', async () => {
        vi.mocked(adjustStockBulk).mockRejectedValueOnce(new Error('Failed to fetch'));
        const onOpenChange = vi.fn();
        render(<BulkAdjustDialog open onOpenChange={onOpenChange} items={[stockItem]} />);
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
        fireEvent.change(screen.getByLabelText('Alasan global'), { target: { value: 'Koreksi hitung' } });
        fireEvent.click(screen.getByRole('button', { name: 'Terapkan ke semua' }));
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Penyesuaian' }));
        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Status penyimpanan belum diketahui');
        expect(alert.textContent).toContain('mutasi stok');
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('2');
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('preserves quantity when global reason changes, applies explicitly, retains on failure, resets on reopen', async () => {
        vi.mocked(adjustStockBulk).mockResolvedValue({ success: false, error: 'Konflik stok', code: 'BUSINESS_RULE' });
        const onOpenChange = vi.fn();
        const props = { open: true, onOpenChange, items: [stockItem] };
        const { rerender } = render(<BulkAdjustDialog {...props} />);
        const qty = screen.getByRole('spinbutton') as HTMLInputElement;
        fireEvent.change(qty, { target: { value: '12' } });
        fireEvent.change(screen.getByLabelText('Alasan global'), { target: { value: 'Koreksi hitung' } });
        expect(qty.value).toBe('12');
        fireEvent.click(screen.getByRole('button', { name: 'Terapkan ke semua' }));
        expect(qty.value).toBe('12');
        rerender(<BulkAdjustDialog {...props} items={[{ ...stockItem }]} />);
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('12');
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Penyesuaian' }));
        await waitFor(() => expect(adjustStockBulk).toHaveBeenCalled());
        expect(vi.mocked(adjustStockBulk).mock.calls[0][0].items[0]).toMatchObject({ quantity: 12, reason: 'Koreksi hitung', type: 'ADJUSTMENT_OUT' });
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toContain('Konflik stok');
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('12');
        rerender(<BulkAdjustDialog {...props} open={false} />);
        rerender(<BulkAdjustDialog {...props} />);
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('0');
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
