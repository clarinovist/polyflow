// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FleetOverview } from '../vehicles/FleetOverview';
import { VehicleDistanceHistory } from '../vehicles/VehicleDistanceHistory';
import { FleetMileageSummary, KirBadge } from '../vehicles/FleetReading';
import { VehicleDetailClient } from '../vehicles/VehicleDetailClient';
import type { VehicleRow } from '../vehicles/VehicleTable';
const mocks = vi.hoisted(() => ({ overview: vi.fn(), history: vi.fn(), refresh: vi.fn(), correct: vi.fn() }));
vi.mock('@/actions/sales/fleet-summary', () => ({ getFleetOverview: mocks.overview }));
vi.mock('@/actions/sales/trip-distance', () => ({ getVehicleDistanceHistory: mocks.history }));
vi.mock('@/actions/sales/vehicle-mileage', () => ({ correctVehicleMileage: mocks.correct }));
vi.mock('@/actions/sales/vehicles', () => ({ deleteVehicle: vi.fn() }));
vi.mock('@/actions/sales/vehicle-tariffs', () => ({ deleteVehicleTariff: vi.fn() }));
vi.mock('../vehicles/VehicleDialog', () => ({ VehicleDialog: () => null }));
vi.mock('../vehicles/VehicleTariffDialog', () => ({ VehicleTariffDialog: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const vehicle: VehicleRow = { id: 'v', plateNumber: 'SYNTHETIC', name: 'Mobil pabrik', ownershipType: 'FACTORY', vehicleType: 'L300', ownerName: null, driverName: null, capacityKg: null, status: 'ACTIVE', photoUrl: null, kirNumber: null, kirExpireDate: null, tariffs: [], _count: { deliveryOrders: 2 } };
const summary = { vehicleId: 'v', month: '2026-09', actualKm: null, recordedTrips: 0, pendingTrips: 2, undatedTrips: 1, latestReading: null };
const row = { id: 't', scheduleId: 's', scheduleNumber: 'SCH', departureDate: null, status: 'COMPLETED', routeName: null, legs: [], plannedDistanceKm: 80, actualDistanceKm: null, odometerStart: 100, odometerEnd: null, returnedAt: null, driverName: 'Snapshot', deliveries: [{ id: 'do', orderNumber: 'SJ-1', status: 'PENDING', vehicleId: null }] };
beforeEach(() => {
    vi.resetAllMocks();
    mocks.overview.mockResolvedValue({ success: true, data: [summary] });
    mocks.history.mockResolvedValue({ success: true, data: { ...summary, rows: [row] } });
});
afterEach(cleanup);
describe('fleet overview and detail', () => {
    it('shows unknown KIR, coverage and errors rather than empty/zero, and retries', async () => {
        mocks.overview.mockRejectedValueOnce(new Error('network'));
        render(<FleetOverview vehicles={[vehicle]} />);
        expect(screen.getByRole('status').textContent).toContain('Memuat');
        await screen.findByRole('alert');
        expect(screen.queryByText('KM trip: 0 km')).toBeNull();
        fireEvent.click(screen.getByText('Coba lagi'));
        await screen.findAllByText('KM trip: Belum tercatat');
        expect(screen.getAllByText('KIR belum diisi')).toHaveLength(2); // desktop/mobile
        expect(screen.getAllByText(/0 rit lengkap · 2 belum lengkap/)).toHaveLength(2);
        expect(screen.getAllByText(/1 rit tanpa tanggal/)).toHaveLength(2);
        fireEvent.change(screen.getByLabelText('Bulan keberangkatan (WIB)'), { target: { value: '2026-08' } });
        await waitFor(() => expect(mocks.overview).toHaveBeenLastCalledWith(['v'], '2026-08'));
    });
    it('does not let a stale request replace a newer month', async () => {
        let finishFirst!: (value: unknown) => void;
        mocks.overview.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }));
        render(<FleetOverview vehicles={[vehicle]} />);
        fireEvent.change(screen.getByLabelText('Bulan keberangkatan (WIB)'), { target: { value: '2026-08' } });
        await screen.findAllByText('KM trip: Belum tercatat');
        finishFirst({ success: true, data: [{ ...summary, actualKm: 999, recordedTrips: 1 }] });
        await waitFor(() => expect(screen.queryByText('KM trip: 999 km')).toBeNull());
    });
    it('preserves recorded zero and latest dated trip-start source', () => {
        render(<FleetMileageSummary summary={{ ...summary, actualKm: 0, recordedTrips: 1, latestReading: { km: 0, recordedAt: '2026-09-23T01:00:00Z', source: 'TRIP_START', scheduleId: 's', scheduleNumber: 'SCH' } }} />);
        expect(screen.getByText('KM trip: 0 km')).toBeTruthy();
        expect(screen.getByText(/Dicatat.*WIB/)).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Odometer berangkat · SCH' }).getAttribute('href')).toBe('/sales/delivery-schedules/s');
    });
    it('separates SJ status, returned vehicle and undated trips without claiming completion', async () => {
        render(<VehicleDistanceHistory vehicleId="v" />);
        await screen.findByText('Trip: Selesai');
        expect(screen.getByText('Kendaraan kembali: belum tercatat')).toBeTruthy();
        expect(screen.getByText(/Tanggal belum tercatat/)).toBeTruthy();
        expect(screen.getByText(/Kendaraan SJ berbeda/)).toBeTruthy();
        expect(screen.getByRole('link', { name: 'SJ-1' }).getAttribute('href')).toBe('/sales/deliveries/do');
        expect(screen.getByText(/PENDING/)).toBeTruthy();
        expect(screen.getByText('Aktual periode: Belum tercatat')).toBeTruthy();
    });
    it('shows returned evidence and genuine zero independently from cancelled trip status', async () => {
        mocks.history.mockResolvedValue({ success: true, data: { ...summary, actualKm: 0, recordedTrips: 1, rows: [{ ...row, status: 'CANCELLED', departureDate: '2026-09-23', actualDistanceKm: 0, odometerEnd: 100, returnedAt: '2026-09-23T07:00:00Z', deliveries: [] }] } });
        render(<VehicleDistanceHistory vehicleId="v" />);
        await screen.findByText('Trip: Dibatalkan');
        expect(screen.getByText(/Kembali dicatat.*WIB/)).toBeTruthy();
        expect(screen.getByText('Aktual periode: 0 km')).toBeTruthy();
        expect(screen.getByText('Belum ada SJ tertaut pada trip ini.')).toBeTruthy();
    });
    it('labels a record without a schedule, shows its note and reloads history after a correction', async () => {
        const standalone = { ...row, id: 'u', mileageId: 'u', scheduleId: null, scheduleNumber: null, status: null, departureDate: '2026-09-24T01:00:00Z', driverName: 'Sopir A', odometerStart: 200, odometerEnd: 230, actualDistanceKm: 30, note: 'ke gudang', deliveries: [] };
        mocks.history.mockResolvedValue({ success: true, data: { ...summary, rows: [standalone] } });
        mocks.correct.mockResolvedValue({ success: true, data: {} });
        render(<VehicleDistanceHistory vehicleId="v" />);
        await screen.findByText(/Tanpa jadwal ·/);
        expect(screen.getByText('Keterangan: ke gudang')).toBeTruthy();
        expect(screen.queryByText(/Trip:/)).toBeNull();
        expect(screen.queryByText('Belum ada SJ tertaut pada trip ini.')).toBeNull();
        fireEvent.click(screen.getByText('Koreksi'));
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText('Alasan koreksi (wajib)'), { target: { value: 'salah ketik' } });
        fireEvent.click(within(dialog).getByText('Simpan koreksi'));
        await waitFor(() => expect(mocks.correct).toHaveBeenCalledWith(expect.objectContaining({ mileageId: 'u', odometerStart: 200, odometerEnd: 230, reason: 'salah ketik' })));
        await waitFor(() => expect(mocks.history).toHaveBeenCalledTimes(2));
    });
    it('offers no correction for a trip without an odometer record', async () => {
        render(<VehicleDistanceHistory vehicleId="v" />);
        await screen.findByText('Trip: Selesai');
        expect(screen.queryByText('Koreksi')).toBeNull();
    });
    it('shows a latest reading without a schedule as Tanpa jadwal', () => {
        render(<FleetMileageSummary summary={{ ...summary, latestReading: { km: 230, recordedAt: '2026-09-24T01:00:00Z', source: 'TRIP_RETURN', scheduleId: null, scheduleNumber: null } }} />);
        expect(screen.getByText('Odometer kembali · Tanpa jadwal')).toBeTruthy();
        expect(screen.queryByRole('link')).toBeNull();
    });
    it('places the same trip history ahead of tariffs and labels SJ count honestly', () => {
        render(<VehicleDetailClient vehicle={{ ...vehicle, notes: null, tariffs: [] }}><p>Existing history slot</p></VehicleDetailClient>);
        expect(screen.getByText('SJ tertaut (semua status)')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Perjalanan & pengiriman' }).getAttribute('href')).toBe('#vehicle-trips');
        expect(document.getElementById('vehicle-trips')?.textContent).toContain('Existing history slot');
        expect(screen.getByText(/Pengingat servis dihitung dari interval yang diisi admin/)).toBeTruthy();
        expect(screen.queryByText(/riwayat servis belum tersedia/)).toBeNull();
        expect(screen.getByText('KIR belum diisi')).toBeTruthy();
    });
    it('renders the Servis panel slot after the summary and links to it', () => {
        render(<VehicleDetailClient vehicle={{ ...vehicle, notes: null, tariffs: [] }} servicePanel={<p>Service panel slot</p>}><p>Existing history slot</p></VehicleDetailClient>);
        expect(screen.getByRole('link', { name: 'Servis' }).getAttribute('href')).toBe('#vehicle-service');
        expect(document.getElementById('vehicle-service')?.textContent).toBe('Service panel slot');
    });
    it('summarises trucks that need service and marks their rows', async () => {
        const alerts = [{ vehicleId: 'v', plateNumber: 'SYNTHETIC', items: [{ itemId: 'i', label: 'Oli mesin', status: 'LEWAT' as const, dueBy: 'KM' as const, remainingText: 'lewat 1.200 km' }] }];
        render(<FleetOverview vehicles={[vehicle]} serviceAlerts={alerts} />);
        expect(screen.getByLabelText('Ringkasan servis').textContent).toContain('1 truk perlu servis');
        expect(screen.getByLabelText('Ringkasan servis').textContent).toContain('SYNTHETIC');
        await screen.findAllByText('KM trip: Belum tercatat');
        expect(screen.getAllByText('Oli mesin: lewat 1.200 km')).toHaveLength(2); // desktop/mobile
        expect(screen.queryByText(/Jadwal\/riwayat servis belum dicatat/)).toBeNull();
    });
    it('says so when no truck needs service and when the alerts could not be loaded', async () => {
        const { unmount } = render(<FleetOverview vehicles={[vehicle]} />);
        expect(screen.getByLabelText('Ringkasan servis').textContent).toContain('Tidak ada truk pabrik');
        await screen.findAllByText('KM trip: Belum tercatat');
        unmount();
        render(<FleetOverview vehicles={[vehicle]} serviceAlerts={null} />);
        expect(screen.getByLabelText('Ringkasan servis').textContent).toContain('belum dapat dimuat');
        await screen.findAllByText('KM trip: Belum tercatat');
    });
    it('renders warning text without pulsing or treating missing KIR as valid', () => {
        const { container } = render(<KirBadge expiry="2000-01-01" />);
        expect(screen.getByText(/KIR kedaluwarsa/)).toBeTruthy();
        expect(container.innerHTML).not.toContain('animate-pulse');
    });
});
