// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const mocks = vi.hoisted(() => ({
    listLeaveRequests: vi.fn(),
    approveLeaveRequest: vi.fn(),
    rejectLeaveRequest: vi.fn(),
    createLeaveRequest: vi.fn(),
    getLeaveRecap: vi.fn(),
    getEmployees: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    toastInfo: vi.fn(),
}));

vi.mock('@/actions/hrd/disciplinary-leave', () => ({
    listLeaveRequests: (...a: unknown[]) => mocks.listLeaveRequests(...a),
    approveLeaveRequest: (...a: unknown[]) => mocks.approveLeaveRequest(...a),
    rejectLeaveRequest: (...a: unknown[]) => mocks.rejectLeaveRequest(...a),
    createLeaveRequest: (...a: unknown[]) => mocks.createLeaveRequest(...a),
    getLeaveRecap: (...a: unknown[]) => mocks.getLeaveRecap(...a),
}));
vi.mock('@/actions/admin/employees', () => ({
    getEmployees: (...a: unknown[]) => mocks.getEmployees(...a),
}));
vi.mock('sonner', () => ({
    toast: {
        success: (...a: unknown[]) => mocks.toastSuccess(...a),
        error: (...a: unknown[]) => mocks.toastError(...a),
        info: (...a: unknown[]) => mocks.toastInfo(...a),
    },
}));

import { LeaveRequestsManager } from '../LeaveRequestsManager';

const PENDING_ROW = {
    id: 'l-1',
    employee: { code: 'E1', name: 'Budi Contoh' },
    type: 'SICK',
    startDate: '2026-01-05T12:00:00.000Z',
    endDate: '2026-01-07T12:00:00.000Z',
    reason: 'Demam',
    status: 'PENDING' as const,
    reviewNotes: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmployees.mockResolvedValue({ success: true, data: [] });
    mocks.getLeaveRecap.mockResolvedValue({ success: false });
    mocks.listLeaveRequests.mockResolvedValue({
        success: true,
        data: [PENDING_ROW],
    });
    mocks.approveLeaveRequest.mockResolvedValue({ success: true, data: null });
    mocks.rejectLeaveRequest.mockResolvedValue({ success: true, data: null });
});

async function openDialog(actionName: string) {
    render(<LeaveRequestsManager />);
    fireEvent.click(await screen.findByRole('button', { name: actionName }));
}

describe('LeaveRequestsManager review dialog', () => {
    it('does not call the action when the dialog is cancelled', async () => {
        await openDialog('Setujui');

        fireEvent.click(await screen.findByRole('button', { name: 'Batal' }));

        expect(mocks.approveLeaveRequest).not.toHaveBeenCalled();
    });

    it('approves with the typed note and shows Indonesian labels', async () => {
        await openDialog('Setujui');
        fireEvent.change(await screen.findByLabelText(/Catatan/), {
            target: { value: 'Silakan istirahat' },
        });

        const buttons = await screen.findAllByRole('button', { name: 'Setujui' });
        fireEvent.click(buttons[buttons.length - 1]);

        await waitFor(() =>
            expect(mocks.approveLeaveRequest).toHaveBeenCalledWith(
                'l-1',
                'Silakan istirahat',
            ),
        );
        expect(mocks.toastSuccess).toHaveBeenCalled();
        expect(screen.getByText('Menunggu')).toBeTruthy();
    });

    it('requires a reason to reject and sends it', async () => {
        await openDialog('Tolak');

        const buttons = await screen.findAllByRole('button', { name: 'Tolak' });
        const confirm = buttons[buttons.length - 1];
        expect(confirm.hasAttribute('disabled')).toBe(true);
        fireEvent.change(screen.getByLabelText(/Alasan penolakan/), {
            target: { value: 'Jadwal padat' },
        });
        fireEvent.click(confirm);

        await waitFor(() =>
            expect(mocks.rejectLeaveRequest).toHaveBeenCalledWith(
                'l-1',
                'Jadwal padat',
            ),
        );
    });

    it('shows an info toast when approval preserved clocked-in days', async () => {
        mocks.approveLeaveRequest.mockResolvedValue({
            success: true,
            data: { preservedAttendanceCount: 2 },
        });
        await openDialog('Setujui');

        const buttons = await screen.findAllByRole('button', { name: 'Setujui' });
        fireEvent.click(buttons[buttons.length - 1]);

        await waitFor(() =>
            expect(mocks.toastInfo).toHaveBeenCalledWith(
                '2 hari sudah punya catatan hadir dan tidak diubah',
            ),
        );
    });

    it('shows an error toast when the action throws', async () => {
        mocks.approveLeaveRequest.mockRejectedValue(new Error('boom'));
        await openDialog('Setujui');

        const buttons = await screen.findAllByRole('button', { name: 'Setujui' });
        fireEvent.click(buttons[buttons.length - 1]);

        await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
        expect(mocks.toastSuccess).not.toHaveBeenCalled();
    });
});

describe('LeaveRequestsManager load failure', () => {
    it('shows an error state with retry instead of an empty list', async () => {
        mocks.listLeaveRequests.mockResolvedValueOnce({
            success: false,
            error: 'gagal',
        });
        render(<LeaveRequestsManager />);

        expect(await screen.findByText(/Gagal memuat/)).toBeTruthy();
        expect(screen.queryByText('Belum ada pengajuan')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));

        expect(await screen.findByText('Budi Contoh', { exact: false })).toBeTruthy();
    });
});
