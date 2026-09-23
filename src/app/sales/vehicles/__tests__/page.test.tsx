// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VehiclesPage from '../page';
const mocks = vi.hoisted(() => ({ vehicles: vi.fn() }));
vi.mock('@/actions/sales/vehicles', () => ({ getVehicles: mocks.vehicles }));
vi.mock('@/components/sales/vehicles/FleetOverview', () => ({ FleetOverview: ({ vehicles }: { vehicles: unknown[] }) => <p>Fleet rows: {vehicles.length}</p> }));
vi.mock('@/lib/utils/utils', () => ({ serializeData: (data: unknown) => data }));
afterEach(cleanup);
describe('fleet page', () => {
    it('renders a successful empty fleet', async () => {
        mocks.vehicles.mockResolvedValue({ success: true, data: [] });
        render(await VehiclesPage());
        expect(screen.getByText('Fleet rows: 0')).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('does not disguise a failed read as an empty fleet', async () => {
        mocks.vehicles.mockResolvedValue({ success: false, error: 'Akses ditolak' });
        render(await VehiclesPage());
        expect(screen.getByRole('alert').textContent).toContain('Akses ditolak');
        expect(screen.queryByText('Fleet rows: 0')).toBeNull();
        expect(screen.getByRole('link', { name: 'Muat ulang daftar armada' }).getAttribute('href')).toBe('/sales/vehicles');
    });
});
