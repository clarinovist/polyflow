// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TripDistancePanel } from '../schedules/schedule-detail/TripDistancePanel';
import { RouteDistanceManager } from '../RouteDistanceManager';
import { VehicleDistanceHistory } from '../vehicles/VehicleDistanceHistory';
import type { Trip } from '../schedules/schedule-detail/types';
const mocks = vi.hoisted(() => ({ routes: vi.fn(), save: vi.fn(), plan: vi.fn(), start: vi.fn(), finish: vi.fn(), history: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/actions/sales/trip-distance', () => ({ listRouteDistances: mocks.routes, saveRouteDistance: mocks.save, saveTripDistancePlan: mocks.plan, startTripMileage: mocks.start, finishTripMileage: mocks.finish, getVehicleDistanceHistory: mocks.history }));
const trip = (overrides: Partial<Trip> = {}): Trip => ({
    id: 't', vehicleId: 'v', transportMode: 'INTERNAL_FLEET', departureDate: '2026-09-23', routeName: null, runNumber: null, status: 'PLANNED', notes: null, externalProvider: null, externalPlate: null, externalDriver: null, cancelReason: null,
    vehicle: { id: 'v', plateNumber: 'SYNTHETIC', name: 'Factory', driverName: 'Driver', ownershipType: 'FACTORY' }, orders: [], ...overrides,
});
beforeEach(() => {
    vi.resetAllMocks();
    mocks.routes.mockResolvedValue({ success: true, data: [{ id: 'a', originAddress: 'F', destinationAddress: 'A', distanceKm: 40 }, { id: 'b', originAddress: 'A', destinationAddress: 'F', distanceKm: 44 }] });
    for (const fn of [mocks.save, mocks.plan, mocks.start, mocks.finish]) fn.mockResolvedValue({ success: true });
    mocks.history.mockResolvedValue({ success: true, data: { rows: [], actualKm: 0, recordedTrips: 0, pendingTrips: 0 } });
});
afterEach(cleanup);
describe('distance UI', () => {
    it('builds an ordered plan and submits route ids, not a client-controlled total', async () => {
        render(<TripDistancePanel trip={trip()} />);
        fireEvent.click(screen.getByText('Kelola kilometer'));
        await screen.findByText('F → A · 40 km', { selector: 'option' });
        for (const id of ['a', 'b']) {
            fireEvent.change(screen.getByLabelText('Tambah ruas sesuai urutan (termasuk pulang)'), { target: { value: id } });
            fireEvent.click(screen.getByText('Tambah ruas', { selector: 'button' }));
        }
        expect(screen.getByText('84 km')).toBeTruthy();
        fireEvent.click(screen.getByText('Simpan rencana jarak'));
        await waitFor(() => expect(mocks.plan).toHaveBeenCalledWith({ tripId: 't', routeIds: ['a', 'b'] }));
        await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    });
    it('rejects disconnected preview and permits removing last leg', async () => {
        render(<TripDistancePanel trip={trip()} />);
        fireEvent.click(screen.getByText('Kelola kilometer'));
        await screen.findByText('F → A · 40 km', { selector: 'option' });
        for (let i = 0; i < 2; i++) {
            fireEvent.change(screen.getByLabelText('Tambah ruas sesuai urutan (termasuk pulang)'), { target: { value: 'a' } });
            fireEvent.click(screen.getByText('Tambah ruas', { selector: 'button' }));
        }
        expect(screen.getByText(/Ruas belum tersambung/)).toBeTruthy();
        expect((screen.getByText('Simpan rencana jarak') as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByText('Hapus ruas terakhir'));
        expect((screen.getByText('Simpan rencana jarak') as HTMLButtonElement).disabled).toBe(false);
    });
    it('records actual start separately and exposes server rejection', async () => {
        mocks.start.mockResolvedValue({ success: false, error: 'Odometer mundur' });
        render(<TripDistancePanel trip={trip({ status: 'DEPARTED' })} />);
        fireEvent.click(screen.getByText('Kelola kilometer'));
        fireEvent.change(screen.getByLabelText('Odometer saat berangkat (km)'), { target: { value: '100' } });
        fireEvent.click(screen.getByText('Simpan odometer awal'));
        await screen.findByText('Odometer mundur');
        expect(mocks.start).toHaveBeenCalledWith({ tripId: 't', driverName: 'Driver', odometerStart: 100 });
        expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it('finishes a completed trip when vehicle returns without counting per delivery', async () => {
        render(<TripDistancePanel trip={trip({ status: 'COMPLETED', mileage: { driverName: 'D', odometerStart: 100, odometerEnd: null } })} />);
        fireEvent.click(screen.getByText('Kelola kilometer'));
        fireEvent.change(screen.getByLabelText('Odometer saat kembali (km)'), { target: { value: '184' } });
        fireEvent.click(screen.getByText('Simpan odometer akhir'));
        await waitFor(() => expect(mocks.finish).toHaveBeenCalledWith({ tripId: 't', odometerEnd: 184 }));
    });
    it('hides entry for private fleet and shows recorded zero without editable end', () => {
        const { rerender, container } = render(<TripDistancePanel trip={trip({ vehicle: null })} />);
        expect(container.textContent).toBe('');
        rerender(<TripDistancePanel trip={trip({ status: 'COMPLETED', plannedDistanceKm: 40, mileage: { driverName: 'D', odometerStart: 0, odometerEnd: 0 } })} />);
        expect(screen.getByText('0 km', { selector: 'strong' })).toBeTruthy();
        fireEvent.click(screen.getByText('Kelola kilometer'));
        expect(screen.queryByText('Simpan odometer akhir')).toBeNull();
    });
    it('handles route load failure/retry and master editing', async () => {
        mocks.routes.mockRejectedValueOnce(new Error('network'));
        render(<RouteDistanceManager />);
        fireEvent.click(screen.getByText('Kelola ruas jalan'));
        await screen.findByRole('alert');
        fireEvent.click(screen.getByText('Muat ulang'));
        await screen.findByText('F → A');
        fireEvent.click(screen.getAllByText('Edit')[0]);
        expect((screen.getByLabelText('Alamat asal') as HTMLInputElement).value).toBe('F');
        fireEvent.change(screen.getByLabelText('Jarak jalan satu arah (km)'), { target: { value: '42' } });
        fireEvent.click(screen.getByText('Simpan ruas jalan'));
        await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ originAddress: 'F', destinationAddress: 'A', distanceKm: 42 }));
    });
    it('shows history errors, retries, and month filter', async () => {
        mocks.history.mockResolvedValueOnce({ success: false, error: 'No access' });
        render(<VehicleDistanceHistory vehicleId="v" />);
        await screen.findByRole('alert');
        fireEvent.click(screen.getByText('Coba lagi'));
        await screen.findByText('Belum ada perjalanan pada bulan ini.');
        fireEvent.change(screen.getByLabelText('Bulan keberangkatan'), { target: { value: '2026-08' } });
        await waitFor(() => expect(mocks.history).toHaveBeenLastCalledWith('v', '2026-08'));
    });
});
