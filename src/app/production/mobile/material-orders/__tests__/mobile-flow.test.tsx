// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DetailPage from '../[id]/page';
import ListPage from '../page';
import { MaterialOrderForm } from '../new/form-client';
const mocks = vi.hoisted(() => ({ detail: vi.fn(), list: vi.fn(), create: vi.fn(), submit: vi.fn(), approve: vi.fn(), reject: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { role: 'FACTORY_MANAGER' } }) }));
vi.mock('@/actions/production/material-orders', () => ({ getMaterialOrderDetail: mocks.detail, getMaterialOrders: mocks.list, createMaterialOrder: mocks.create, submitMaterialOrder: mocks.submit, approveMaterialOrder: mocks.approve, rejectMaterialOrder: mocks.reject }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const data = { orderTypes: ['HD'], boms: [], materials: [{ id: 'material', name: 'Bahan A', skuCode: 'BA', unit: 'PCS' }] };
beforeEach(() => {
    vi.resetAllMocks();
    mocks.detail.mockResolvedValue({ success: true, data: { id: 'mo', orderNumber: 'MO-01', orderType: 'HD', status: 'PENDING', viewer: { canApprove: true, canReject: true }, items: [{ id: 'item', quantity: 12, quantityUnit: 'PCS', zakQuantity: null, material: { name: 'Bahan A', skuCode: 'BA' } }] } });
    mocks.list.mockResolvedValue({ success: true, data: [{ id: 'mo', orderNumber: 'MO-01', orderType: 'HD', status: 'PENDING', itemCount: 1 }] });
    mocks.create.mockResolvedValue({ success: true, data: { id: 'mo', orderNumber: 'MO-01' } });
    mocks.submit.mockResolvedValue({ success: true });
    mocks.approve.mockResolvedValue({ success: true });
});
afterEach(cleanup);
describe('mobile material request lifecycle', () => {
    it('lists a real mobile detail link and renders snapshot units and existing authorized actions', async () => {
        const { unmount } = render(await ListPage());
        expect(screen.getByRole('link', { name: /MO-01/ }).getAttribute('href')).toBe('/production/mobile/material-orders/mo');
        expect(screen.queryByRole('link', { name: '+ Buat' })).toBeNull();
        unmount(); render(await DetailPage({ params: Promise.resolve({ id: 'mo' }) }));
        expect(screen.getByText('12 PCS')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Setujui' }));
        await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith('mo'));
        expect(mocks.refresh).toHaveBeenCalled();
    });
    it('keeps failed reads distinct from missing or empty documents', async () => {
        mocks.detail.mockResolvedValue({ success: false });
        render(await DetailPage({ params: Promise.resolve({ id: 'mo' }) }));
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Setujui' })).toBeNull();
    });
    it('keeps a stable request key and locks its contents after an uncertain create response', async () => {
        mocks.create.mockRejectedValueOnce(new Error('Network response lost'));
        render(<MaterialOrderForm data={data} />);
        fireEvent.click(screen.getByRole('button', { name: '+ Tambah bahan' }));
        fireEvent.change(screen.getAllByRole('combobox').at(-1)!, { target: { value: 'material' } });
        fireEvent.change(screen.getByLabelText('Jumlah bahan 1'), { target: { value: '12' } });
        fireEvent.click(screen.getByRole('button', { name: 'Kirim ke Kepala Pabrik' }));
        await waitFor(() => expect((screen.getByRole('button', { name: 'Kirim ke Kepala Pabrik' }) as HTMLButtonElement).disabled).toBe(false));
        expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Kirim ke Kepala Pabrik' }));
        await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
        expect(mocks.create.mock.calls[0][0]).toEqual(mocks.create.mock.calls[1][0]);
    });
    it('retries sending a saved draft without creating another request or leaving mobile', async () => {
        mocks.submit.mockResolvedValueOnce({ success: false, error: 'Coba lagi' });
        render(<MaterialOrderForm data={data} />);
        fireEvent.click(screen.getByRole('button', { name: '+ Tambah bahan' }));
        const selects = screen.getAllByRole('combobox');
        fireEvent.change(selects.at(-1)!, { target: { value: 'material' } });
        fireEvent.change(screen.getByLabelText('Jumlah bahan 1'), { target: { value: '12' } });
        fireEvent.click(screen.getByRole('button', { name: 'Kirim ke Kepala Pabrik' }));
        await screen.findByRole('button', { name: 'Kirim Ulang Permintaan' });
        expect(mocks.push).not.toHaveBeenCalled();
        await waitFor(() => expect((screen.getByRole('button', { name: 'Kirim Ulang Permintaan' }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole('button', { name: 'Kirim Ulang Permintaan' }));
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/production/mobile/material-orders/mo'));
        expect(mocks.create).toHaveBeenCalledOnce();
        expect(mocks.submit).toHaveBeenCalledTimes(2);
        expect(mocks.create.mock.calls[0][0].items).toEqual([{ productVariantId: 'material', quantity: 12 }]);
    });
});
