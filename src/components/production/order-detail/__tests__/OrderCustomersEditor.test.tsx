// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), save: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/actions/production/order-customers', () => ({ saveOrderCustomers: mocks.save }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { OrderCustomersEditor } from '../OrderCustomersEditor';
const a = { id: 'a', name: 'Synthetic A' };
const b = { id: 'b', name: 'Synthetic B' };
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.save.mockResolvedValue({ success: true }); });
function openEditor() {
    render(<OrderCustomersEditor orderId="wo" customers={[a, b]} selected={[a]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Atur customer tujuan' }));
}
describe('customer destination editor', () => {
    it('saves multiple customers, closes dialog and refreshes', async () => {
        openEditor();
        fireEvent.click(screen.getByLabelText('Synthetic B'));
        fireEvent.click(screen.getByRole('button', { name: 'Simpan customer' }));
        await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ orderId: 'wo', customerIds: ['a', 'b'] }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
        expect(screen.queryByRole('dialog')).toBeNull();
    });
    it.each(['rejected', 'thrown'])('keeps the dialog and choices for %s failure', async (failure) => {
        if (failure === 'thrown') mocks.save.mockRejectedValueOnce(new Error('network'));
        else mocks.save.mockResolvedValueOnce({ success: false, error: 'Forbidden' });
        openEditor();
        fireEvent.click(screen.getByRole('button', { name: 'Simpan customer' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalled());
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect((screen.getByLabelText('Synthetic A') as HTMLInputElement).checked).toBe(true);
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
});
