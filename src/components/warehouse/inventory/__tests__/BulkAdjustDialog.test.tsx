// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BulkAdjustDialog } from '../BulkAdjustDialog';
import { stockItem } from './inventory-fixtures';
import { adjustStockBulk } from '@/actions/inventory/inventory';

vi.mock('@/actions/inventory/inventory', () => ({ adjustStockBulk: vi.fn() }));
afterEach(cleanup);
describe('BulkAdjustDialog draft', () => {
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
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('12');
        rerender(<BulkAdjustDialog {...props} open={false} />);
        rerender(<BulkAdjustDialog {...props} />);
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('0');
    });
});
