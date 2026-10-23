// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BOMList } from '../bom/BOMList';
import { PhotoGalleryDialog } from '../PhotoGalleryDialog';
import { ShiftList } from '../ShiftList';
import { RunDetailClient } from '../runs/RunDetailClient';
const mocks = vi.hoisted(() => ({ remove: vi.fn(), cancel: vi.fn(), ready: vi.fn(), cost: vi.fn(), rm: vi.fn(), error: vi.fn() }));
// Native image is intentional: this fixture tests gallery behavior, not Next image optimization.
// eslint-disable-next-line @next/next/no-img-element
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));
vi.mock('next/navigation', () => ({ usePathname: () => '/production/boms', useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/actions/production/boms', () => ({ bulkArchiveBom: vi.fn() }));
vi.mock('../bom/BOMActions', () => ({ BOMActions: () => null }));
vi.mock('../bom/DuplicateBomDialog', () => ({ DuplicateBomDialog: () => null }));
vi.mock('@/actions/admin/work-shifts', () => ({ deleteWorkShift: mocks.remove }));
vi.mock('../ShiftDialog', () => ({ ShiftDialog: () => null }));
vi.mock('@/actions/production/production-runs', () => ({ cancelProductionRun: mocks.cancel, getRunReadiness: mocks.ready, getRunCost: mocks.cost, checkRunRmAvailability: mocks.rm }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.error } }));
const run = { id: 'run', runNumber: 'RUN-01', status: 'IN_PROGRESS', plannedQuantity: 100, routeVersionSnapshot: 1, routeNameSnapshot: 'Rute A', orders: [{ id: 'spk', orderNumber: 'SPK-01', status: 'IN_PROGRESS', plannedQuantity: 100, actualQuantity: 10, routeSequenceSnapshot: 0, processCodeSnapshot: null, processNameSnapshot: null }] };
beforeEach(() => {
    vi.resetAllMocks();
    mocks.remove.mockResolvedValue({ success: true });
    mocks.cancel.mockResolvedValue({ success: false, error: 'Status berubah' });
    mocks.ready.mockResolvedValue({ success: true, data: [] });
    mocks.cost.mockResolvedValue({ success: false });
    mocks.rm.mockResolvedValue({ success: true, data: { ready: true, shortages: [] } });
});
afterEach(cleanup);

describe('small production UI regressions', () => {
    it.each([true, false])('empty BOM spans all actual columns, prices=%s', (showPrices) => {
        render(<BOMList boms={[]} showPrices={showPrices} />);
        const table = screen.getByRole('table');
        expect(table.querySelector('tbody td')?.getAttribute('colspan')).toBe(String(table.querySelectorAll('thead th').length));
        expect(screen.getByText('Tidak ada formula pada kategori Semua Formula')).toBeTruthy();
        const tab = screen.getByRole('tab', { name: 'Proses Ulang' });
        fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
        expect(screen.getByText('Tidak ada formula pada kategori Proses Ulang')).toBeTruthy();
    });
    it('renders gallery quantities in the supplied output unit, including its total', async () => {
        render(<PhotoGalleryDialog unit="PCS" orderNumber="SPK-PCS" executions={[{ id: 'e', quantityProduced: 20, photoUrl: '/fixture.png', endTime: null, notes: null }]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Lihat 1 foto SPK-PCS' }));
        expect(screen.getAllByText('20 PCS')).toHaveLength(2);
        expect(screen.queryByText(/20 KG/)).toBeNull();
    });
    it('formats gallery dates in WIB with supported tokens', async () => {
        render(<PhotoGalleryDialog unit="KG" orderNumber="SPK-01" executions={[{ id: 'e', quantityProduced: 2, photoUrl: '/fixture.png', endTime: '2026-10-23T03:30:00Z', notes: null }]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Lihat 1 foto SPK-01' }));
        expect(await screen.findByText('23 Oct 10:30')).toBeTruthy();
        fireEvent.click(screen.getByAltText('Output 1'));
        expect(await screen.findByText('23 Oct 2026 10:30')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Foto berikutnya' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Tutup foto' }));
        expect(screen.queryByText('DD Oct 10:30')).toBeNull();
    });
    it('does not delete a shift before explicit dialog confirmation', async () => {
        render(<ShiftList shifts={[{ id: 'shift', name: 'Pagi', startTime: '08:00', endTime: '16:00', status: 'ACTIVE', plannedHours: 8 } as never]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Hapus shift Pagi' }));
        expect(mocks.remove).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        expect(mocks.remove).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Hapus shift Pagi' }));
        fireEvent.click(screen.getByRole('button', { name: 'Hapus Shift' }));
        await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('shift'));
    });
    it('shows failed run side panels instead of implying readiness or zero costs', async () => {
        render(<RunDetailClient initialRun={run} />);
        expect(screen.getByRole('status').textContent).toContain('Memuat');
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.queryByText(/Bahan baku tersedia untuk tahap pertama/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        await waitFor(() => expect(mocks.cost).toHaveBeenCalledTimes(2));
    });
    it('requires a reason for force cancellation and preserves server payload', async () => {
        render(<RunDetailClient initialRun={run} />);
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button', { name: 'Batalkan Rangkaian' }));
        const confirm = screen.getByRole('button', { name: 'Konfirmasi Pembatalan' }) as HTMLButtonElement;
        expect(confirm.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Alasan pembatalan (wajib)'), { target: { value: '  Permintaan dibatalkan  ' } });
        fireEvent.click(confirm);
        await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith({ id: 'run', force: true, reason: 'Permintaan dibatalkan' }));
        expect(mocks.error).toHaveBeenCalledWith('Status berubah');
    });
    it('keeps ordinary cancellation as the existing id-only action', async () => {
        render(<RunDetailClient initialRun={{ ...run, orders: [] }} />);
        await screen.findByRole('alert');
        fireEvent.click(screen.getByRole('button', { name: 'Batalkan Rangkaian' }));
        expect(screen.queryByLabelText('Alasan pembatalan (wajib)')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Konfirmasi Pembatalan' }));
        await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith('run'));
    });
});
