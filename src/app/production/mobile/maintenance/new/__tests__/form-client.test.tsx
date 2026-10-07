// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaintenanceForm } from '../form-client';
import {
    createMaintenanceRequest,
    submitMaintenanceRequest,
} from '@/actions/production/maintenance';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, refresh }),
}));
vi.mock('sonner', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/actions/production/maintenance', () => ({
    createMaintenanceRequest: vi.fn(),
    submitMaintenanceRequest: vi.fn(),
}));

const props = {
    machines: [
        { id: 'machine-1', name: 'Mesin Satu', code: 'MC-01', status: 'ACTIVE' },
    ],
    spareCatalog: [
        { id: 'variant-1', name: 'Bearing', skuCode: 'BRG-01' },
    ],
    locations: [{ id: 'location-1', name: 'Gudang Teknik', slug: 'teknik' }],
    canManageSpareParts: false,
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
});

describe('MaintenanceForm', () => {
    it('shows inline errors and never submits an incomplete spare part', () => {
        render(<MaintenanceForm {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Kirim laporan' }));
        expect(screen.getByText('Pilih mesin yang mengalami gangguan.')).toBeTruthy();
        expect(screen.getByText('Jelaskan keluhan minimal 5 karakter.')).toBeTruthy();
        expect(createMaintenanceRequest).not.toHaveBeenCalled();
    });

    it('creates, submits, and stays inside the mobile maintenance flow', async () => {
        vi.mocked(createMaintenanceRequest).mockResolvedValue({
            success: true,
            data: { id: 'mt-1', orderNumber: 'MT-1' },
        });
        vi.mocked(submitMaintenanceRequest).mockResolvedValue({
            success: true,
            data: { id: 'mt-1' },
        });
        render(<MaintenanceForm {...props} />);

        fireEvent.change(screen.getByLabelText('Mesin *'), {
            target: { value: 'machine-1' },
        });
        fireEvent.change(screen.getByLabelText('Keluhan *'), {
            target: { value: 'Bearing berbunyi kasar.' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: /Mendesak/ }),
        );
        fireEvent.click(screen.getByLabelText(/Mesin berhenti/));
        fireEvent.click(
            screen.getByRole('button', { name: /Kebutuhan spare part/ }),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Tambah spare part' }),
        );
        fireEvent.change(screen.getByLabelText('Nama part *'), {
            target: { value: 'Bearing' },
        });
        fireEvent.change(screen.getByLabelText('Jumlah *'), {
            target: { value: '2' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Kirim laporan' }));

        await waitFor(() => expect(createMaintenanceRequest).toHaveBeenCalled());
        expect(createMaintenanceRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                machineId: 'machine-1',
                urgency: 'URGENT',
                machineStopped: true,
                spareParts: [expect.objectContaining({ name: 'Bearing', quantity: 2 })],
            }),
        );
        expect(submitMaintenanceRequest).toHaveBeenCalledWith('mt-1');
        expect(push).toHaveBeenCalledWith('/production/mobile/maintenance/mt-1');
    });
});
