// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaveRequestSheet } from '../LeaveRequestSheet';

const createMyLeaveRequest = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock('@/actions/employee/leave', () => ({ createMyLeaveRequest }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function openSheet() {
    render(<LeaveRequestSheet />);
    fireEvent.click(
        screen.getByRole('button', { name: /Ajukan Izin/ }),
    );
}

function submitButton() {
    return screen.getByRole('button', { name: 'Kirim Pengajuan' });
}

describe('LeaveRequestSheet', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createMyLeaveRequest.mockResolvedValue({ success: true });
    });

    it('disables submit until a reason is chosen', () => {
        openSheet();

        expect((submitButton() as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Sakit' }));

        expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
    });

    it('requires a note when the reason is Lainnya', () => {
        openSheet();
        fireEvent.click(screen.getByRole('button', { name: 'Lainnya' }));

        expect((submitButton() as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(screen.getByLabelText('Keterangan tambahan'), {
            target: { value: 'Urusan mendadak' },
        });

        expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
    });

    it('submits the chosen range and reason without an employee id', async () => {
        openSheet();
        fireEvent.click(screen.getByRole('button', { name: 'Sakit' }));
        fireEvent.change(screen.getByLabelText('Keterangan tambahan'), {
            target: { value: ' demam ' },
        });

        fireEvent.click(submitButton());

        await waitFor(() => expect(createMyLeaveRequest).toHaveBeenCalled());
        const payload = createMyLeaveRequest.mock.calls[0][0];
        expect(payload).toEqual({
            startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            endDate: payload.startDate,
            reasonCode: 'SICK',
            note: 'demam',
        });
        expect(payload).not.toHaveProperty('employeeId');
        await waitFor(() => expect(refresh).toHaveBeenCalled());
    });
});
