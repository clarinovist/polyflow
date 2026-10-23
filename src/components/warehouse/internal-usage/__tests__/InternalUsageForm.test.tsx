// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InternalUsageForm } from '../InternalUsageForm';
import { InternalUsageDetail } from '../InternalUsageDetail';
import { InternalUsageHistory } from '../InternalUsageHistory';
import type { InternalUsageFormData, InternalUsageRecord } from '@/types/internal-usage';
const m = vi.hoisted(() => ({ save: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push, refresh: m.refresh }) }));
vi.mock('@/actions/inventory/internal-usage', () => ({ createInternalUsageAction: m.save }));
vi.mock('@/components/ui/select', () => ({
    Select: ({ value, onValueChange, children, disabled }: { value: string; onValueChange: (id: string) => void; children: ReactNode; disabled?: boolean }) => <select value={value} disabled={disabled} onChange={(e) => onValueChange(e.target.value)}><option value=""/>{children}</select>,
    SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>,
}));
const data: InternalUsageFormData = { date: '2026-10-23', actorName: 'Warehouse', products: [{ id: 'pen', name: 'Pen', skuCode: 'PEN', unit: 'PCS', stocks: [{ locationId: 'office', locationName: 'Office', quantity: 24, reserved: 2, available: 22 }] }] };
const record: InternalUsageRecord = { id: 'doc', number: 'PI-00001', movementId: 'move', productName: 'Pen', skuCode: 'PEN', unit: 'PCS', quantity: 3, locationName: 'Office', recipient: 'Staff', department: 'Admin', purpose: 'Writing', recordedByName: 'Warehouse', stockBefore: 24, stockAfter: 21, createdAt: '2026-10-23T03:00:00Z' };
function fill() {
    const [product, location] = screen.getAllByRole('combobox');
    fireEvent.change(product, { target: { value: 'pen' } }); fireEvent.change(location, { target: { value: 'office' } });
    for (const [label, value] of [['Jumlah diambil *', '3'], ['Penerima *', 'Staff'], ['Bagian *', 'Admin'], ['Keperluan *', 'Writing']]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
beforeEach(() => { vi.resetAllMocks(); m.save.mockResolvedValue({ success: true, data: record }); });
afterEach(cleanup);
describe('internal usage UI', () => {
    it('previews then confirms once, without SPK fields or client account selections', async () => {
        render(<InternalUsageForm data={data}/>); fill();
        expect(screen.getByText('24 → 21 PCS')).toBeTruthy();
        expect((screen.getByLabelText('Tanggal pemakaian') as HTMLInputElement).readOnly).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Periksa pemakaian' }));
        expect(m.save).not.toHaveBeenCalled();
        const save = screen.getByRole('button', { name: 'Konfirmasi pemakaian' }); fireEvent.click(save); fireEvent.click(save);
        await waitFor(() => expect(m.push).toHaveBeenCalledWith('/warehouse/internal-usage/doc?created=1'));
        expect(m.save).toHaveBeenCalledTimes(1); expect(m.save.mock.calls[0][0]).toMatchObject({ quantity: 3, unit: 'PCS', recipient: 'Staff' });
        expect(m.save.mock.calls[0][0]).not.toHaveProperty('inventoryAccountId');
    });
    it('retains intent id for network retry and does not silently report success', async () => {
        m.save.mockRejectedValueOnce(new Error('network'));
        render(<InternalUsageForm data={data}/>); fill(); fireEvent.click(screen.getByRole('button', { name: 'Periksa pemakaian' }));
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi pemakaian' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Koneksi terputus'));
        expect(m.push).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi pemakaian' }));
        await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
        expect(m.save.mock.calls[0][0].requestId).toBe(m.save.mock.calls[1][0].requestId);
    });
    it('shows domain rejection and supports cancel before saving', async () => {
        m.save.mockResolvedValue({ success: false, error: 'Finance belum siap' });
        render(<InternalUsageForm data={data}/>); fill(); fireEvent.click(screen.getByRole('button', { name: 'Periksa pemakaian' }));
        fireEvent.click(screen.getByRole('button', { name: 'Kembali periksa' })); expect(m.save).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Periksa pemakaian' })); fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi pemakaian' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Finance belum siap'));
    });
    it('rejects unavailable quantities and required whitespace, and explains empty catalogue', () => {
        const view = render(<InternalUsageForm data={data}/>); fill();
        fireEvent.change(screen.getByLabelText('Jumlah diambil *'), { target: { value: '23' } });
        fireEvent.submit(view.container.querySelector('form')!); expect(screen.getByRole('alert').textContent).toContain('stok tersedia');
        fireEvent.change(screen.getByLabelText('Jumlah diambil *'), { target: { value: '3' } });
        fireEvent.change(screen.getByLabelText('Penerima *'), { target: { value: '  ' } });
        fireEvent.submit(view.container.querySelector('form')!); expect(screen.getByRole('alert').textContent).toContain('penerima');
        view.unmount(); render(<InternalUsageForm data={{ ...data, products: [] }}/>); expect(screen.getByText('Belum ada Barang Operasional')).toBeTruthy();
    });
    it('renders persisted snapshot detail and bounded history/filter navigation', () => {
        const detail = render(<InternalUsageDetail record={record}/>); expect(screen.getByText('24 → 21 PCS')).toBeTruthy(); expect(screen.getByText('Writing')).toBeTruthy(); detail.unmount();
        render(<InternalUsageHistory data={{ records: [record], total: 51, page: 2, pageSize: 25, query: 'Pen', department: 'Admin', departments: ['Admin'] }}/>);
        expect(screen.getByRole('link', { name: 'Berikutnya' }).getAttribute('href')).toContain('page=3');
        expect(screen.getByRole('link', { name: 'Sebelumnya' }).getAttribute('href')).toContain('page=1');
        expect(screen.getByLabelText('Cari barang, penerima, atau nomor bukti')).toBeTruthy();
    });
});
