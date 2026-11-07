// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VehicleMileagePage from '../page';

const mocks = vi.hoisted(() => ({ board: vi.fn(), alerts: vi.fn() }));
vi.mock('@/actions/sales/vehicle-mileage', () => ({ getFleetMileageBoard: mocks.board }));
vi.mock('@/actions/sales/vehicle-service', () => ({ getFleetServiceAlerts: mocks.alerts }));
vi.mock('@/components/sales/vehicles/MileageBoard', () => ({ MileageBoard: ({ cards, serviceAlerts }: { cards: unknown[]; serviceAlerts: unknown[] }) => <p>Truck cards: {cards.length} alerts: {serviceAlerts.length}</p> }));
afterEach(cleanup);
beforeEach(() => { mocks.alerts.mockResolvedValue({ success: true, data: [] }); });

describe('vehicle mileage page', () => {
    it('renders the board with the loaded cards', async () => {
        mocks.board.mockResolvedValue({ success: true, data: [{ vehicleId: 'v' }] });
        render(await VehicleMileagePage());
        expect(screen.getByText('Truck cards: 1 alerts: 0')).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('passes service alerts to the board and degrades to none when they fail to load', async () => {
        mocks.board.mockResolvedValue({ success: true, data: [{ vehicleId: 'v' }] });
        mocks.alerts.mockResolvedValue({ success: true, data: [{ vehicleId: 'v' }, { vehicleId: 'w' }] });
        render(await VehicleMileagePage());
        expect(screen.getByText('Truck cards: 1 alerts: 2')).toBeTruthy();
        cleanup();
        mocks.alerts.mockResolvedValue({ success: false, error: 'gagal' });
        render(await VehicleMileagePage());
        expect(screen.getByText('Truck cards: 1 alerts: 0')).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });
    it('does not disguise a failed read as an empty board', async () => {
        mocks.board.mockResolvedValue({ success: false, error: 'Akses ditolak' });
        render(await VehicleMileagePage());
        expect(screen.getByRole('alert').textContent).toContain('Akses ditolak');
        expect(screen.queryByText(/Truck cards/)).toBeNull();
        expect(screen.getByRole('link', { name: 'Muat ulang' }).getAttribute('href')).toBe('/sales/vehicles/km');
    });
});
