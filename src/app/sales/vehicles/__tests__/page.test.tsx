// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VehiclesPage from '../page';
const mocks = vi.hoisted(() => ({ vehicles: vi.fn(), alerts: vi.fn() }));
vi.mock('@/actions/sales/vehicles', () => ({ getVehicles: mocks.vehicles }));
vi.mock('@/actions/sales/vehicle-service', () => ({ getFleetServiceAlerts: mocks.alerts }));
vi.mock('@/components/sales/vehicles/FleetOverview', () => ({ FleetOverview: ({ vehicles, serviceAlerts }: { vehicles: unknown[]; serviceAlerts: unknown[] | null }) => <p>Fleet rows: {vehicles.length} alerts: {serviceAlerts === null ? 'none-loaded' : serviceAlerts.length}</p> }));
vi.mock('@/lib/utils/utils', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/utils/utils')>()), serializeData: (data: unknown) => data }));
afterEach(cleanup);
beforeEach(() => { mocks.alerts.mockResolvedValue({ success: true, data: [] }); });
describe('fleet page', () => {
    it('renders a successful empty fleet', async () => {
        mocks.vehicles.mockResolvedValue({ success: true, data: [] });
        render(await VehiclesPage());
        expect(screen.getByText('Fleet rows: 0 alerts: 0')).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('links to the quick KM entry page', async () => {
        mocks.vehicles.mockResolvedValue({ success: true, data: [] });
        render(await VehiclesPage());
        expect(screen.getByRole('link', { name: /Isi KM truk/ }).getAttribute('href')).toBe('/sales/vehicles/km');
    });
    it('passes the service alerts to the overview and null when they fail to load', async () => {
        mocks.vehicles.mockResolvedValue({ success: true, data: [] });
        mocks.alerts.mockResolvedValue({ success: true, data: [{ vehicleId: 'v' }] });
        render(await VehiclesPage());
        expect(screen.getByText('Fleet rows: 0 alerts: 1')).toBeTruthy();
        cleanup();
        mocks.alerts.mockResolvedValue({ success: false, error: 'gagal' });
        render(await VehiclesPage());
        expect(screen.getByText('Fleet rows: 0 alerts: none-loaded')).toBeTruthy();
    });
    it('does not disguise a failed read as an empty fleet', async () => {
        mocks.vehicles.mockResolvedValue({ success: false, error: 'Akses ditolak' });
        render(await VehiclesPage());
        expect(screen.getByRole('alert').textContent).toContain('Akses ditolak');
        expect(screen.queryByText(/Fleet rows/)).toBeNull();
        expect(screen.getByRole('link', { name: 'Muat ulang daftar armada' }).getAttribute('href')).toBe('/sales/vehicles');
    });
});
