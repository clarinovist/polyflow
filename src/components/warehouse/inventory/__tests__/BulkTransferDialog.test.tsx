// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkTransferDialog } from '../BulkTransferDialog';
import { stockItem } from './inventory-fixtures';
import { getLocations } from '@/actions/inventory/locations';
vi.mock('@/actions/inventory/locations', () => ({ getLocations: vi.fn() }));
vi.mock('@/actions/inventory/inventory', () => ({ transferStockBulk: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
describe('bulk transfer draft and load failure', () => {
    it('preserves input on equivalent props, clears on reopening, loads destinations once', async () => {
        vi.mocked(getLocations).mockResolvedValue({ success: true, data: [] });
        const props = { open: true, onOpenChange: vi.fn(), items: [{ ...stockItem, availableQuantity: 100 }] };
        const { rerender } = render(<BulkTransferDialog {...props} />);
        await waitFor(() => expect(screen.queryByText('Memuat lokasi…')).toBeNull());
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '8' } });
        rerender(<BulkTransferDialog {...props} items={[{ ...props.items[0] }]} />);
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('8');
        expect(getLocations).toHaveBeenCalledTimes(1);
        rerender(<BulkTransferDialog {...props} open={false} />);
        rerender(<BulkTransferDialog {...props} />);
        await waitFor(() => expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('0'));
    });
    it('disables confirmation when destination loading rejects', async () => {
        vi.mocked(getLocations).mockRejectedValue(new Error('network'));
        render(<BulkTransferDialog open onOpenChange={vi.fn()} items={[stockItem]} />);
        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
        expect((screen.getByRole('button', { name: 'Konfirmasi Transfer' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
