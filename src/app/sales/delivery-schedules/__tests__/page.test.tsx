// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeliverySchedulesPage from '../page';
const mocks = vi.hoisted(() => ({ list: vi.fn(), props: vi.fn() }));
vi.mock('@/actions/sales/delivery-schedules', () => ({ getDeliverySchedules: mocks.list }));
vi.mock('@/components/sales/schedules/ScheduleListClient', () => ({ ScheduleListClient: (props: { loadError?: boolean }) => {
    mocks.props(props);
    return props.loadError ? <p role="alert">Gagal memuat jadwal kirim.</p> : <p>Daftar tersedia</p>;
} }));
afterEach(cleanup);
describe('delivery schedule page', () => {
    it('passes only serializable list fields including external trips without a vehicle', async () => {
        const orders = [{ id: 'stop', status: 'PLANNED', deliveryOrderId: null }];
        mocks.list.mockResolvedValue({ success: true, data: [{
            id: 'schedule', scheduleNumber: 'JADWAL-DEMO', status: 'DRAFT',
            weekStart: new Date('2026-09-21'), weekEnd: new Date('2026-09-27'),
            createdBy: { name: 'Synthetic unused creator' },
            trips: [{ vehicle: null, orders }],
        }] });
        render(await DeliverySchedulesPage());
        expect(mocks.props).toHaveBeenLastCalledWith({ loadError: false, schedules: [{
            id: 'schedule', scheduleNumber: 'JADWAL-DEMO', status: 'DRAFT',
            weekStart: '2026-09-21T00:00:00.000Z', weekEnd: '2026-09-27T00:00:00.000Z', vehicles: [{ orders }],
        }] });
    });
    it('keeps a successful empty list distinct from load failure', async () => {
        mocks.list.mockResolvedValue({ success: true, data: [] });
        render(await DeliverySchedulesPage());
        expect(screen.getByText('Daftar tersedia')).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('does not convert a rejected list result into a successful empty list', async () => {
        mocks.list.mockResolvedValue({ success: false, error: 'Synthetic internal detail' });
        render(await DeliverySchedulesPage());
        expect(screen.getByRole('alert').textContent).toContain('Gagal memuat');
        expect(screen.queryByText('Daftar tersedia')).toBeNull();
        expect(screen.queryByText('Synthetic internal detail')).toBeNull();
    });
});
