// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaintenanceActions } from '../maintenance-actions';
import {
    approveMaintenanceRequest,
    completeMaintenanceRequest,
    rejectMaintenanceRequest,
    startMaintenanceRequest,
    submitMaintenanceRequest,
} from '@/actions/production/maintenance';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh }),
}));
vi.mock('@/actions/production/maintenance', () => ({
    approveMaintenanceRequest: vi.fn(),
    completeMaintenanceRequest: vi.fn(),
    rejectMaintenanceRequest: vi.fn(),
    startMaintenanceRequest: vi.fn(),
    submitMaintenanceRequest: vi.fn(),
}));

const noActions = {
    canSubmit: false,
    canApprove: false,
    canReject: false,
    canStart: false,
    canComplete: false,
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('MaintenanceActions', () => {
    it('shows a recovery action for a draft and submits it again', async () => {
        vi.mocked(submitMaintenanceRequest).mockResolvedValue({
            success: true,
            data: { id: 'mt-1' },
        });
        render(
            <MaintenanceActions
                id="mt-1"
                status="DRAFT"
                viewer={{ ...noActions, canSubmit: true }}
                technicians={[]}
                spareParts={[]}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Kirim ulang laporan' }),
        );
        await waitFor(() =>
            expect(submitMaintenanceRequest).toHaveBeenCalledWith('mt-1'),
        );
        expect(refresh).toHaveBeenCalled();
    });

    it('requires a real technician account before approval', async () => {
        vi.mocked(approveMaintenanceRequest).mockResolvedValue({
            success: true,
            data: { id: 'mt-1' },
        });
        render(
            <MaintenanceActions
                id="mt-1"
                status="PENDING"
                viewer={{ ...noActions, canApprove: true, canReject: true }}
                technicians={[{ id: 'tech-1', name: 'Teknisi Satu' }]}
                spareParts={[]}
            />,
        );

        const approve = screen.getByRole('button', {
            name: 'Setujui & tugaskan',
        }) as HTMLButtonElement;
        expect(approve.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Teknisi pelaksana'), {
            target: { value: 'tech-1' },
        });
        expect(approve.disabled).toBe(false);
        fireEvent.click(approve);
        await waitFor(() =>
            expect(approveMaintenanceRequest).toHaveBeenCalledWith(
                'mt-1',
                'tech-1',
            ),
        );
    });

    it('uses injected decision actions for a mobile caller', async () => {
        const approveAction = vi.fn().mockResolvedValue({ success: true });
        render(
            <MaintenanceActions
                id="mt-1"
                status="PENDING"
                viewer={{ ...noActions, canApprove: true }}
                technicians={[{ id: 'tech-1', name: 'Teknisi Satu' }]}
                spareParts={[]}
                approveAction={approveAction}
            />,
        );
        fireEvent.change(screen.getByLabelText('Teknisi pelaksana'), {
            target: { value: 'tech-1' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Setujui & tugaskan' }));
        await waitFor(() =>
            expect(approveAction).toHaveBeenCalledWith('mt-1', 'tech-1'),
        );
        expect(approveMaintenanceRequest).not.toHaveBeenCalled();
    });

    it('hides privileged actions when the viewer cannot act', () => {
        render(
            <MaintenanceActions
                id="mt-1"
                status="PENDING"
                viewer={noActions}
                technicians={[]}
                spareParts={[]}
            />,
        );
        expect(screen.queryByRole('button', { name: 'Setujui & tugaskan' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Tolak laporan' })).toBeNull();
        expect(screen.getByText(/Menunggu keputusan Admin/)).toBeTruthy();
    });

    it('submits completion notes and only stock-linked checked parts', async () => {
        vi.mocked(completeMaintenanceRequest).mockResolvedValue({
            success: true,
            data: { id: 'mt-1' },
        });
        render(
            <MaintenanceActions
                id="mt-1"
                status="IN_PROGRESS"
                viewer={{ ...noActions, canComplete: true }}
                technicians={[]}
                spareParts={[
                    {
                        id: 'part-1',
                        name: 'Bearing',
                        fulfilled: false,
                        productVariantId: 'variant-1',
                    },
                    {
                        id: 'part-2',
                        name: 'Part manual',
                        fulfilled: false,
                        productVariantId: null,
                    },
                ]}
            />,
        );

        fireEvent.click(screen.getByLabelText('Bearing'));
        fireEvent.change(screen.getByLabelText('Hasil perbaikan'), {
            target: { value: 'Bearing diganti dan mesin diuji.' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Tandai selesai' }));

        await waitFor(() =>
            expect(completeMaintenanceRequest).toHaveBeenCalledWith(
                'mt-1',
                'Bearing diganti dan mesin diuji.',
                ['part-1'],
            ),
        );
        expect(rejectMaintenanceRequest).not.toHaveBeenCalled();
        expect(startMaintenanceRequest).not.toHaveBeenCalled();
    });
});
