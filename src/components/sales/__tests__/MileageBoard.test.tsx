// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MileageBoard } from '../vehicles/MileageBoard';
import type { MileageBoardCard } from '@/services/sales/vehicle-mileage-service';

const mocks = vi.hoisted(() => ({ start: vi.fn(), finish: vi.fn(), correct: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/actions/sales/vehicle-mileage', () => ({
    startVehicleMileage: mocks.start, finishVehicleMileage: mocks.finish, correctVehicleMileage: mocks.correct,
}));

const parked: MileageBoardCard = {
    vehicleId: 'v1', plateNumber: 'B 1234 XY', name: 'Truk A', defaultDriver: 'Sopir A', lastOdometerEnd: 1500,
    latest: { id: 'm1', driverName: 'Sopir A', odometerStart: 1400, odometerEnd: 1500, startedAt: '2026-11-06T01:00:00.000Z', note: null },
    isOpen: false, isStale: false,
    todayDeliveries: [{ id: 'd1', orderNumber: 'SJ-001', customerName: 'Customer A' }, { id: 'd2', orderNumber: 'SJ-002', customerName: null }],
};
const away: MileageBoardCard = {
    vehicleId: 'v2', plateNumber: 'B 5678 ZZ', name: 'Truk B', defaultDriver: null, lastOdometerEnd: 900,
    latest: { id: 'm2', driverName: 'Sopir B', odometerStart: 1000, odometerEnd: null, startedAt: '2026-11-04T01:00:00.000Z', note: null },
    isOpen: true, isStale: true, todayDeliveries: [],
};
const card = (plate: string) => screen.getByRole('region', { name: `KM ${plate}` });

beforeEach(() => {
    vi.resetAllMocks();
    for (const fn of [mocks.start, mocks.finish, mocks.correct]) fn.mockResolvedValue({ success: true, data: {} });
});
afterEach(cleanup);

describe('mileage board', () => {
    it('renders one card per truck with status, last reading and todays delivery notes', () => {
        render(<MileageBoard cards={[parked, away]} />);
        const pool = within(card('B 1234 XY'));
        expect(pool.getByText('Di pool')).toBeTruthy();
        expect(pool.getByText('1.500 km')).toBeTruthy();
        expect(pool.getByText('SJ-001 · Customer A')).toBeTruthy();
        expect(pool.getByText('SJ-002 · Tanpa customer')).toBeTruthy();
        const travelling = within(card('B 5678 ZZ'));
        expect(travelling.getByText(/Sedang jalan sejak/)).toBeTruthy();
        expect(travelling.getByRole('status').textContent).toContain('lebih dari 1 hari');
        expect(travelling.getByText('Tidak ada SJ hari ini.')).toBeTruthy();
    });
    it('shows a message when there is no active factory truck', () => {
        render(<MileageBoard cards={[]} />);
        expect(screen.getByText(/Belum ada mobil pabrik/)).toBeTruthy();
    });
    it('prefills driver and start reading, uses numeric keyboard and submits the start', async () => {
        render(<MileageBoard cards={[parked]} />);
        const view = within(card('B 1234 XY'));
        expect((view.getByLabelText('Sopir') as HTMLInputElement).value).toBe('Sopir A');
        const km = view.getByLabelText('KM berangkat') as HTMLInputElement;
        expect(km.value).toBe('1500');
        expect(km.getAttribute('inputmode')).toBe('decimal');
        fireEvent.change(km, { target: { value: '1500,5' } });
        fireEvent.change(view.getByLabelText('Keterangan (opsional)'), { target: { value: 'ke gudang' } });
        fireEvent.click(view.getByText('Simpan berangkat'));
        await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({ vehicleId: 'v1', driverName: 'Sopir A', odometerStart: 1500.5, note: 'ke gudang' }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    });
    it('blocks a start without a reading and shows server rejection without refreshing', async () => {
        render(<MileageBoard cards={[parked]} />);
        const view = within(card('B 1234 XY'));
        fireEvent.change(view.getByLabelText('KM berangkat'), { target: { value: '' } });
        fireEvent.click(view.getByText('Simpan berangkat'));
        expect((await view.findByRole('alert')).textContent).toContain('KM berangkat wajib');
        expect(mocks.start).not.toHaveBeenCalled();
        mocks.start.mockResolvedValue({ success: false, error: 'Odometer mundur' });
        fireEvent.change(view.getByLabelText('KM berangkat'), { target: { value: '10' } });
        fireEvent.click(view.getByText('Simpan berangkat'));
        await view.findByText('Odometer mundur');
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it('shows the travelled distance live and submits the return reading', async () => {
        render(<MileageBoard cards={[away]} />);
        const view = within(card('B 5678 ZZ'));
        fireEvent.change(view.getByLabelText('KM kembali'), { target: { value: '1084' } });
        expect(view.getByText('84 km', { selector: 'strong' })).toBeTruthy();
        fireEvent.click(view.getByText('Simpan kembali'));
        await waitFor(() => expect(mocks.finish).toHaveBeenCalledWith({ mileageId: 'm2', odometerEnd: 1084 }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    });
    it('does not show a travelled distance for a reading below the start', () => {
        render(<MileageBoard cards={[away]} />);
        const view = within(card('B 5678 ZZ'));
        fireEvent.change(view.getByLabelText('KM kembali'), { target: { value: '999' } });
        expect(view.queryByText(/KM tempuh/)).toBeNull();
    });
    it('requires a reason before a correction is sent, then submits it', async () => {
        render(<MileageBoard cards={[parked]} />);
        fireEvent.click(within(card('B 1234 XY')).getByText('Koreksi'));
        const dialog = await screen.findByRole('dialog');
        const view = within(dialog);
        expect((view.getByLabelText('KM berangkat') as HTMLInputElement).value).toBe('1400');
        fireEvent.change(view.getByLabelText('KM kembali'), { target: { value: '1510' } });
        fireEvent.click(view.getByText('Simpan koreksi'));
        expect((await view.findByRole('alert')).textContent).toContain('Alasan koreksi wajib');
        expect(mocks.correct).not.toHaveBeenCalled();
        fireEvent.change(view.getByLabelText('Alasan koreksi (wajib)'), { target: { value: 'salah ketik' } });
        fireEvent.click(view.getByText('Simpan koreksi'));
        await waitFor(() => expect(mocks.correct).toHaveBeenCalledWith({
            mileageId: 'm1', driverName: 'Sopir A', odometerStart: 1400, odometerEnd: 1510, reason: 'salah ketik',
        }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
    it('keeps the dialog open and shows the server error when a correction is rejected', async () => {
        mocks.correct.mockResolvedValue({ success: false, error: 'Odometer kembali tidak boleh di atas odometer berangkat perjalanan berikutnya.' });
        render(<MileageBoard cards={[parked]} />);
        fireEvent.click(within(card('B 1234 XY')).getByText('Koreksi'));
        const view = within(await screen.findByRole('dialog'));
        fireEvent.change(view.getByLabelText('Alasan koreksi (wajib)'), { target: { value: 'salah ketik' } });
        fireEvent.click(view.getByText('Simpan koreksi'));
        await view.findByText(/tidak boleh di atas/);
        expect(mocks.refresh).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeTruthy();
    });
    it('lets an open record stay open in a correction but requires an end for a closed one', async () => {
        render(<MileageBoard cards={[away]} />);
        fireEvent.click(within(card('B 5678 ZZ')).getByText('Koreksi'));
        const view = within(await screen.findByRole('dialog'));
        fireEvent.change(view.getByLabelText('Alasan koreksi (wajib)'), { target: { value: 'salah ketik' } });
        fireEvent.change(view.getByLabelText('KM berangkat'), { target: { value: '990' } });
        fireEvent.click(view.getByText('Simpan koreksi'));
        await waitFor(() => expect(mocks.correct).toHaveBeenCalledWith(expect.objectContaining({ mileageId: 'm2', odometerStart: 990, odometerEnd: null })));
        cleanup();
        mocks.correct.mockClear();
        render(<MileageBoard cards={[parked]} />);
        fireEvent.click(within(card('B 1234 XY')).getByText('Koreksi'));
        const closed = within(await screen.findByRole('dialog'));
        fireEvent.change(closed.getByLabelText('KM kembali'), { target: { value: '' } });
        fireEvent.change(closed.getByLabelText('Alasan koreksi (wajib)'), { target: { value: 'salah ketik' } });
        fireEvent.click(closed.getByText('Simpan koreksi'));
        expect((await closed.findByRole('alert')).textContent).toContain('KM kembali wajib');
        expect(mocks.correct).not.toHaveBeenCalled();
    });
    it('hides the correction button for a truck without any record', () => {
        render(<MileageBoard cards={[{ ...parked, latest: null, lastOdometerEnd: null, isOpen: false }]} />);
        expect(screen.queryByText('Koreksi')).toBeNull();
        expect((screen.getByLabelText('KM berangkat') as HTMLInputElement).value).toBe('');
    });
});
