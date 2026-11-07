// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleServicePanel } from '../vehicles/VehicleServicePanel';
import { ServiceAlertBadges, ServiceStatusBadge } from '../vehicles/ServiceStatusBadge';
import { MileageBoard } from '../vehicles/MileageBoard';
import type { ServiceItemView, VehicleServiceView } from '@/services/sales/vehicle-service-service';
import type { MileageBoardCard } from '@/services/sales/vehicle-mileage-service';

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), record: vi.fn(), correct: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/actions/sales/vehicle-service', () => ({
    createServiceItem: mocks.create, updateServiceItem: mocks.update, recordVehicleService: mocks.record, correctVehicleService: mocks.correct,
}));
vi.mock('@/actions/sales/vehicle-mileage', () => ({ startVehicleMileage: vi.fn(), finishVehicleMileage: vi.fn(), correctVehicleMileage: vi.fn() }));

const item = (overrides: Partial<ServiceItemView> = {}): ServiceItemView => ({
    id: 'i1', label: 'Oli mesin', intervalKm: 10000, intervalDays: null, warnKm: 1000, isActive: true,
    status: 'SEGERA', dueBy: 'KM', currentKm: 49680, dueKm: 50000, remainingKm: 320, remainingDays: null, dueDate: null,
    remainingText: 'sisa 320 km', suggestedKm: 49680,
    records: [{ id: 'r1', servicedAt: '2026-10-01T00:00:00.000Z', odometerKm: 40000, note: 'rutin' }], ...overrides,
});
const view = (overrides: Partial<VehicleServiceView> = {}): VehicleServiceView => ({
    vehicleId: 'v', ownershipType: 'FACTORY', vehicleStatus: 'ACTIVE', latestMileageKm: 49680, items: [item()], ...overrides,
});
const itemCard = (label: string) => screen.getByRole('listitem', { name: `Servis ${label}` });

beforeEach(() => {
    vi.resetAllMocks();
    for (const fn of [mocks.create, mocks.update, mocks.record, mocks.correct]) fn.mockResolvedValue({ success: true, data: {} });
});
afterEach(cleanup);

describe('VehicleServicePanel list', () => {
    it('shows status, remaining distance, due km and terms for an item', () => {
        render(<VehicleServicePanel view={view()} />);
        const row = within(itemCard('Oli mesin'));
        expect(row.getByText('Segera servis')).toBeTruthy();
        expect(row.getByText(/Oli mesin — sisa 320 km \(jatuh tempo di 50\.000 km\)/)).toBeTruthy();
        expect(row.getByText(/Interval 10\.000 km · peringatan 1\.000 km sebelumnya/)).toBeTruthy();
        expect(screen.getByText(/saat ini 49\.680 km/)).toBeTruthy();
    });
    it('shows the due date when the item also has a day interval', () => {
        render(<VehicleServicePanel view={view({ items: [item({ intervalDays: 180, dueDate: '2026-12-01T00:00:00.000Z' })] })} />);
        expect(screen.getByText(/jatuh tempo di 50\.000 km, atau 1 Des 2026\)/)).toBeTruthy();
        expect(screen.getByText(/atau 180 hari/)).toBeTruthy();
    });
    it('explains a missing baseline instead of showing a status number', () => {
        render(<VehicleServicePanel view={view({ items: [item({ status: 'BELUM_ADA_DATA', remainingText: null, records: [], dueKm: null })] })} />);
        expect(screen.getByText('Belum ada data')).toBeTruthy();
        expect(screen.getByText(/Catat servis terakhir sebagai titik awal/)).toBeTruthy();
        expect(screen.queryByText(/Riwayat servis/)).toBeNull();
    });
    it('marks a deactivated item, hides its summary and the record button', () => {
        render(<VehicleServicePanel view={view({ items: [item({ isActive: false })] })} />);
        const row = within(itemCard('Oli mesin'));
        expect(row.getByText('Nonaktif')).toBeTruthy();
        expect(row.queryByText('Catat servis')).toBeNull();
        expect(row.queryByText(/jatuh tempo di/)).toBeNull();
        expect(row.getByText('Ubah interval')).toBeTruthy();
    });
    it('guides the admin when no item exists yet', () => {
        render(<VehicleServicePanel view={view({ items: [] })} />);
        expect(screen.getByText(/Belum ada jenis servis/)).toBeTruthy();
        expect(screen.getByText('Tambah jenis servis')).toBeTruthy();
    });
    it('offers nothing for a non-factory truck and no new item for an inactive truck', () => {
        const { unmount } = render(<VehicleServicePanel view={view({ ownershipType: 'PRIVATE', items: [] })} />);
        expect(screen.getByText(/hanya tersedia untuk mobil pabrik/)).toBeTruthy();
        expect(screen.queryByText('Tambah jenis servis')).toBeNull();
        unmount();
        render(<VehicleServicePanel view={view({ vehicleStatus: 'INACTIVE' })} />);
        expect(screen.getByText(/saat kendaraan berstatus aktif/)).toBeTruthy();
        expect(screen.queryByText('Tambah jenis servis')).toBeNull();
        expect(screen.getByText('Catat servis')).toBeTruthy();
    });
});

describe('VehicleServicePanel actions', () => {
    it('creates an item from a quick-pick label with the interval left to the admin', async () => {
        render(<VehicleServicePanel view={view({ items: [] })} />);
        fireEvent.click(screen.getByText('Tambah jenis servis'));
        const dialog = await screen.findByRole('dialog');
        const interval = within(dialog).getByLabelText('Interval KM') as HTMLInputElement;
        expect(interval.value).toBe('');
        expect(interval.getAttribute('inputmode')).toBe('decimal');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Oli gardan' }));
        expect((within(dialog).getByLabelText('Nama jenis servis') as HTMLInputElement).value).toBe('Oli gardan');
        fireEvent.change(interval, { target: { value: '20000' } });
        fireEvent.change(within(dialog).getByLabelText('Interval hari (opsional)'), { target: { value: '365' } });
        fireEvent.click(within(dialog).getByText('Tambah jenis servis', { selector: 'button[type="submit"]' }));
        await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ vehicleId: 'v', label: 'Oli gardan', intervalKm: 20000, intervalDays: 365, warnKm: undefined }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    });
    it('clears the label for the "Lainnya" quick-pick so the admin can type their own', async () => {
        render(<VehicleServicePanel view={view({ items: [] })} />);
        fireEvent.click(screen.getByText('Tambah jenis servis'));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Ban' }));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Lainnya' }));
        const label = within(dialog).getByLabelText('Nama jenis servis') as HTMLInputElement;
        expect(label.value).toBe('');
        expect(document.activeElement).toBe(label);
    });
    it.each([
        ['', '', 'Interval KM wajib diisi dengan angka.'],
        ['abc', '', 'Interval KM wajib diisi dengan angka.'],
        ['1000', 'x', 'Interval hari harus berupa angka atau dikosongkan.'],
    ])('blocks submit for interval %j and days %j before calling the server', async (km, days, message) => {
        render(<VehicleServicePanel view={view({ items: [] })} />);
        fireEvent.click(screen.getByText('Tambah jenis servis'));
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Interval KM'), { target: { value: km } });
        fireEvent.change(within(dialog).getByLabelText('Interval hari (opsional)'), { target: { value: days } });
        fireEvent.click(within(dialog).getByText('Tambah jenis servis', { selector: 'button[type="submit"]' }));
        expect((await within(dialog).findByRole('alert')).textContent).toBe(message);
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('blocks a non-numeric warning distance', async () => {
        render(<VehicleServicePanel view={view({ items: [] })} />);
        fireEvent.click(screen.getByText('Tambah jenis servis'));
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Interval KM'), { target: { value: '1000' } });
        fireEvent.change(within(dialog).getByLabelText('Peringatan sebelum jatuh tempo (km, opsional)'), { target: { value: 'zz' } });
        fireEvent.click(within(dialog).getByText('Tambah jenis servis', { selector: 'button[type="submit"]' }));
        expect((await within(dialog).findByRole('alert')).textContent).toContain('Jarak peringatan');
    });
    it('keeps the dialog open and shows the server error when saving is rejected', async () => {
        mocks.create.mockResolvedValue({ success: false, error: 'Jenis servis "Ban" sudah ada untuk truk ini.' });
        render(<VehicleServicePanel view={view({ items: [] })} />);
        fireEvent.click(screen.getByText('Tambah jenis servis'));
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Nama jenis servis'), { target: { value: 'Ban' } });
        fireEvent.change(within(dialog).getByLabelText('Interval KM'), { target: { value: '50000' } });
        fireEvent.click(within(dialog).getByText('Tambah jenis servis', { selector: 'button[type="submit"]' }));
        expect((await within(dialog).findByRole('alert')).textContent).toContain('sudah ada');
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it('edits the interval with current values prefilled and can deactivate the item', async () => {
        render(<VehicleServicePanel view={view()} />);
        fireEvent.click(screen.getByText('Ubah interval'));
        const dialog = await screen.findByRole('dialog');
        expect((within(dialog).getByLabelText('Interval KM') as HTMLInputElement).value).toBe('10000');
        expect((within(dialog).getByLabelText('Peringatan sebelum jatuh tempo (km, opsional)') as HTMLInputElement).value).toBe('1000');
        expect(within(dialog).queryByLabelText('Nama jenis servis')).toBeNull();
        fireEvent.change(within(dialog).getByLabelText('Interval KM'), { target: { value: '12000' } });
        fireEvent.click(within(dialog).getByRole('checkbox'));
        fireEvent.click(within(dialog).getByText('Simpan interval'));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ itemId: 'i1', intervalKm: 12000, intervalDays: null, warnKm: 1000, isActive: false }));
    });
    it('records a service with the current km suggested, today as the default date and numeric keyboard', async () => {
        render(<VehicleServicePanel view={view()} />);
        fireEvent.click(screen.getByText('Catat servis'));
        const dialog = await screen.findByRole('dialog');
        const km = within(dialog).getByLabelText('KM saat servis') as HTMLInputElement;
        expect(km.value).toBe('49680');
        expect(km.getAttribute('inputmode')).toBe('decimal');
        const date = within(dialog).getByLabelText('Tanggal servis') as HTMLInputElement;
        expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(date.max).toBe(date.value);
        fireEvent.change(km, { target: { value: '49700,5' } });
        fireEvent.change(within(dialog).getByLabelText('Keterangan (opsional)'), { target: { value: 'ganti filter' } });
        fireEvent.click(within(dialog).getByText('Simpan servis'));
        await waitFor(() => expect(mocks.record).toHaveBeenCalledWith({ vehicleId: 'v', serviceItemId: 'i1', servicedAt: date.value, odometerKm: 49700.5, note: 'ganti filter' }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    });
    it('leaves the km empty when nothing is known and refuses a record without a km or a date', async () => {
        render(<VehicleServicePanel view={view({ items: [item({ suggestedKm: null })] })} />);
        fireEvent.click(screen.getByText('Catat servis'));
        const dialog = await screen.findByRole('dialog');
        expect((within(dialog).getByLabelText('KM saat servis') as HTMLInputElement).value).toBe('');
        fireEvent.click(within(dialog).getByText('Simpan servis'));
        expect((await within(dialog).findByRole('alert')).textContent).toContain('KM saat servis wajib');
        fireEvent.change(within(dialog).getByLabelText('KM saat servis'), { target: { value: '100' } });
        fireEvent.change(within(dialog).getByLabelText('Tanggal servis'), { target: { value: '' } });
        fireEvent.click(within(dialog).getByText('Simpan servis'));
        await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('Tanggal servis wajib'));
        expect(mocks.record).not.toHaveBeenCalled();
    });
    it('shows the history, prefills the correction and requires a reason', async () => {
        render(<VehicleServicePanel view={view()} />);
        fireEvent.click(screen.getByText('Riwayat servis (1)'));
        expect(screen.getByText(/1 Okt 2026 · 40\.000 km · rutin/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Koreksi servis 1 Okt 2026/ }));
        const dialog = await screen.findByRole('dialog');
        expect((within(dialog).getByLabelText('KM saat servis') as HTMLInputElement).value).toBe('40000');
        expect((within(dialog).getByLabelText('Tanggal servis') as HTMLInputElement).value).toBe('2026-10-01');
        expect((within(dialog).getByLabelText('Keterangan (opsional)') as HTMLInputElement).value).toBe('rutin');
        fireEvent.click(within(dialog).getByText('Simpan koreksi'));
        expect((await within(dialog).findByRole('alert')).textContent).toContain('minimal 5 karakter');
        expect(mocks.correct).not.toHaveBeenCalled();
        fireEvent.change(within(dialog).getByLabelText('KM saat servis'), { target: { value: '40500' } });
        fireEvent.change(within(dialog).getByLabelText('Alasan koreksi (wajib)'), { target: { value: 'salah ketik' } });
        fireEvent.click(within(dialog).getByText('Simpan koreksi'));
        await waitFor(() => expect(mocks.correct).toHaveBeenCalledWith({ recordId: 'r1', servicedAt: '2026-10-01', odometerKm: 40500, note: 'rutin', reason: 'salah ketik' }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    });
    it('rejects a correction with a missing km or date and a thrown server action', async () => {
        render(<VehicleServicePanel view={view()} />);
        fireEvent.click(screen.getByText('Riwayat servis (1)'));
        fireEvent.click(screen.getByRole('button', { name: /Koreksi servis/ }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('KM saat servis'), { target: { value: '' } });
        fireEvent.click(within(dialog).getByText('Simpan koreksi'));
        expect((await within(dialog).findByRole('alert')).textContent).toContain('KM saat servis wajib');
        fireEvent.change(within(dialog).getByLabelText('KM saat servis'), { target: { value: '40001' } });
        fireEvent.change(within(dialog).getByLabelText('Tanggal servis'), { target: { value: '' } });
        fireEvent.click(within(dialog).getByText('Simpan koreksi'));
        await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('Tanggal servis wajib'));
        fireEvent.change(within(dialog).getByLabelText('Tanggal servis'), { target: { value: '2026-10-01' } });
        fireEvent.change(within(dialog).getByLabelText('Alasan koreksi (wajib)'), { target: { value: 'salah ketik' } });
        mocks.correct.mockRejectedValue(new Error('network'));
        fireEvent.click(within(dialog).getByText('Simpan koreksi'));
        await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('Gagal menyimpan'));
    });
    it('closes a dialog on cancel without saving', async () => {
        render(<VehicleServicePanel view={view()} />);
        fireEvent.click(screen.getByText('Catat servis'));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByText('Batal'));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(mocks.record).not.toHaveBeenCalled();
    });
});

describe('service badges', () => {
    it('renders a colored status label for each status', () => {
        render(<>{(['AMAN', 'SEGERA', 'LEWAT', 'BELUM_ADA_DATA'] as const).map((status) => <ServiceStatusBadge key={status} status={status} />)}</>);
        expect(screen.getByText('Aman').className).toContain('green');
        expect(screen.getByText('Segera servis').className).toContain('amber');
        expect(screen.getByText('Lewat jadwal').className).toContain('red');
        expect(screen.getByText('Belum ada data').className).toContain('muted');
    });
    it('renders one badge per alert and nothing when there are none', () => {
        const { container, rerender } = render(<ServiceAlertBadges items={[
            { itemId: 'a', label: 'Oli mesin', status: 'SEGERA', dueBy: 'KM', remainingText: 'sisa 320 km' },
            { itemId: 'b', label: 'Ban', status: 'LEWAT', dueBy: 'KM', remainingText: 'lewat 1.200 km' },
        ]} />);
        expect(screen.getByText('Oli mesin: sisa 320 km')).toBeTruthy();
        expect(screen.getByText('Ban: lewat 1.200 km').className).toContain('red');
        rerender(<ServiceAlertBadges items={[]} />);
        expect(container.innerHTML).toBe('');
    });
    it('omits the colon when an alert has no remaining text', () => {
        render(<ServiceAlertBadges items={[{ itemId: 'a', label: 'Filter', status: 'SEGERA', dueBy: null, remainingText: null }]} />);
        expect(screen.getByText('Filter')).toBeTruthy();
    });
});

describe('KM board badges', () => {
    const parked: MileageBoardCard = {
        vehicleId: 'v1', plateNumber: 'B 1234 XY', name: 'Truk A', defaultDriver: null, lastOdometerEnd: 1500,
        latest: { id: 'm1', driverName: 'Sopir A', odometerStart: 1400, odometerEnd: 1500, startedAt: '2026-11-06T01:00:00.000Z', note: null },
        isOpen: false, isStale: false, todayDeliveries: [],
    };
    it('shows the alert badges only on the card of the truck that needs service', () => {
        render(<MileageBoard cards={[parked, { ...parked, vehicleId: 'v2', plateNumber: 'B 9 ZZ' }]} serviceAlerts={[
            { vehicleId: 'v1', plateNumber: 'B 1234 XY', items: [{ itemId: 'a', label: 'Oli mesin', status: 'SEGERA', dueBy: 'KM', remainingText: 'sisa 320 km' }] },
        ]} />);
        expect(within(screen.getByRole('region', { name: 'KM B 1234 XY' })).getByText('Oli mesin: sisa 320 km')).toBeTruthy();
        expect(within(screen.getByRole('region', { name: 'KM B 9 ZZ' })).queryByLabelText('Pengingat servis')).toBeNull();
    });
    it('still renders the board without any alerts', () => {
        render(<MileageBoard cards={[parked]} />);
        expect(screen.queryByLabelText('Pengingat servis')).toBeNull();
        expect(screen.getByText('Simpan berangkat')).toBeTruthy();
    });
});
