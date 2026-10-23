// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Page from '../page';
import { MaterialOrderActions } from '../actions';
const mocks = vi.hoisted(() => ({ detail: vi.fn(), approve: vi.fn(), reject: vi.fn(), refresh: vi.fn() }));
vi.mock('@/actions/production/material-orders', () => ({ getMaterialOrderDetail: mocks.detail, approveMaterialOrder: mocks.approve, rejectMaterialOrder: mocks.reject }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
beforeEach(() => { vi.resetAllMocks(); mocks.approve.mockResolvedValue({ success: true }); mocks.reject.mockResolvedValue({ success: true }); });
afterEach(cleanup);

describe('material order presentation', () => {
    it('renders names, zero zak and unit caveat without a UUID or unavailable action', async () => {
        mocks.detail.mockResolvedValue({ success: true, data: { id: 'mo', orderNumber: 'MO-01', orderType: 'HD', status: 'APPROVED', viewer: { canApprove: false, canReject: false }, items: [{ id: 'line', productVariantId: 'raw-uuid-not-for-display', quantity: 10, zakQuantity: 0, material: { name: 'Bahan A', skuCode: 'SKU-A' } }] } });
        render(await Page({ params: Promise.resolve({ id: 'mo' }) }));
        expect(screen.getByText('Bahan A')).toBeTruthy();
        expect(screen.getByText('SKU-A')).toBeTruthy();
        expect(screen.getByText('0')).toBeTruthy();
        expect(screen.getByText('Satuan belum dicatat')).toBeTruthy();
        expect(screen.queryByText('raw-uuid-not-for-display')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Setujui' })).toBeNull();
    });
    it('requires a nonblank rejection reason and refreshes after success', async () => {
        render(<MaterialOrderActions id="mo" canApprove={false} canReject />);
        expect(screen.queryByRole('button', { name: 'Setujui' })).toBeNull();
        const reject = screen.getByRole('button', { name: 'Tolak' }) as HTMLButtonElement;
        expect(reject.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText(/Alasan penolakan/), { target: { value: 'Bahan berbeda' } });
        fireEvent.click(reject);
        await waitFor(() => expect(mocks.reject).toHaveBeenCalledWith('mo', 'Bahan berbeda'));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
        expect(screen.getByRole('status').textContent).toContain('ditolak');
    });
    it('shows failures and prevents duplicate clicks while an approval is pending', async () => {
        let finish!: (result: { success: boolean; error: string }) => void;
        mocks.approve.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
        render(<MaterialOrderActions id="mo" canApprove canReject={false} />);
        const approve = screen.getByRole('button', { name: 'Setujui' });
        fireEvent.click(approve); fireEvent.click(approve);
        expect(mocks.approve).toHaveBeenCalledOnce();
        finish({ success: false, error: 'Status sudah berubah' });
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Status sudah berubah'));
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it('reports a thrown action failure and allows retry', async () => {
        mocks.approve.mockRejectedValue(new Error('Koneksi terputus'));
        render(<MaterialOrderActions id="mo" canApprove canReject={false} />);
        fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Koneksi terputus'));
        expect((screen.getByRole('button', { name: 'Setujui' }) as HTMLButtonElement).disabled).toBe(false);
    });
});
