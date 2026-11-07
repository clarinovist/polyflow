// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VehicleMileagePage from '../page';

const mocks = vi.hoisted(() => ({ board: vi.fn() }));
vi.mock('@/actions/sales/vehicle-mileage', () => ({ getFleetMileageBoard: mocks.board }));
vi.mock('@/components/sales/vehicles/MileageBoard', () => ({ MileageBoard: ({ cards }: { cards: unknown[] }) => <p>Truck cards: {cards.length}</p> }));
afterEach(cleanup);

describe('vehicle mileage page', () => {
    it('renders the board with the loaded cards', async () => {
        mocks.board.mockResolvedValue({ success: true, data: [{ vehicleId: 'v' }] });
        render(await VehicleMileagePage());
        expect(screen.getByText('Truck cards: 1')).toBeTruthy();
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
