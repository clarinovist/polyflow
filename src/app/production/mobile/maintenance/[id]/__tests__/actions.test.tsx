// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    approve: vi.fn(),
    reject: vi.fn(),
    refresh: vi.fn(),
}));

vi.mock('@/actions/production/mobile-maintenance', () => ({
    approveMobileMaintenanceRequest: mocks.approve,
    rejectMobileMaintenanceRequest: mocks.reject,
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: mocks.refresh }),
}));

import { MaintenanceActions } from '../actions';

const noActions = {
    canSubmit: false,
    canApprove: false,
    canReject: false,
    canStart: false,
    canComplete: false,
};

describe('mobile maintenance action wiring', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.approve.mockResolvedValue({ success: true, data: null });
        mocks.reject.mockResolvedValue({ success: true, data: null });
    });

    it('routes approval through the capability-gated mobile action', async () => {
        render(
            <MaintenanceActions
                id="request-1"
                status="PENDING"
                viewer={{ ...noActions, canApprove: true }}
                technicians={[{ id: 'technician-1', name: 'Teknisi Satu' }]}
                spareParts={[]}
            />,
        );
        fireEvent.change(screen.getByLabelText('Teknisi pelaksana'), {
            target: { value: 'technician-1' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Setujui & tugaskan' }));
        await waitFor(() =>
            expect(mocks.approve).toHaveBeenCalledWith(
                'request-1',
                'technician-1',
            ),
        );
    });

    it('routes rejection through the capability-gated mobile action', async () => {
        render(
            <MaintenanceActions
                id="request-1"
                status="PENDING"
                viewer={{ ...noActions, canReject: true }}
                technicians={[]}
                spareParts={[]}
            />,
        );
        fireEvent.change(screen.getByLabelText('Alasan penolakan'), {
            target: { value: 'Alasan sintetis' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Tolak laporan' }));
        await waitFor(() =>
            expect(mocks.reject).toHaveBeenCalledWith(
                'request-1',
                'Alasan sintetis',
            ),
        );
    });
});
