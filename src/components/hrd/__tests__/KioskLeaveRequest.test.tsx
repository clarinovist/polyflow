// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const { mockKioskRequestLeave } = vi.hoisted(() => ({
    mockKioskRequestLeave: vi.fn(),
}));

vi.mock('@/actions/admin/kiosk-leave', () => ({
    kioskRequestLeave: (...args: unknown[]) => mockKioskRequestLeave(...args),
}));

import { KioskLeaveRequest } from '../KioskLeaveRequest';

const EMPLOYEE = { name: 'Budi', code: 'EMP-001' };

function setup(onSubmitted = vi.fn()) {
    render(<KioskLeaveRequest employee={EMPLOYEE} pin="1234" onSubmitted={onSubmitted} />);
    fireEvent.click(screen.getByRole('button', { name: /Ajukan Izin Tidak Masuk/i }));
    return onSubmitted;
}

const submitButton = () => screen.getByRole('button', { name: 'Kirim Pengajuan' });

describe('KioskLeaveRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockKioskRequestLeave.mockResolvedValue({ success: true, data: { id: 'l1', days: 1 } });
    });

    it('disables the trigger without employee, PIN, or when disabled', () => {
        const { rerender } = render(
            <KioskLeaveRequest employee={null} pin="1234" onSubmitted={vi.fn()} />,
        );
        const trigger = () => screen.getByRole('button', { name: /Ajukan Izin Tidak Masuk/i });
        expect(trigger().hasAttribute('disabled')).toBe(true);
        rerender(<KioskLeaveRequest employee={EMPLOYEE} pin="  " onSubmitted={vi.fn()} />);
        expect(trigger().hasAttribute('disabled')).toBe(true);
        rerender(<KioskLeaveRequest employee={EMPLOYEE} pin="1234" disabled onSubmitted={vi.fn()} />);
        expect(trigger().hasAttribute('disabled')).toBe(true);
    });

    it('keeps submit disabled until a reason is chosen', async () => {
        setup();
        expect(submitButton().hasAttribute('disabled')).toBe(true);
        fireEvent.click(await screen.findByRole('button', { name: 'Sakit' }));
        expect(submitButton().hasAttribute('disabled')).toBe(false);
    });

    it('requires a note when the reason is Lainnya', async () => {
        setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Lainnya' }));
        expect(submitButton().hasAttribute('disabled')).toBe(true);
        fireEvent.change(screen.getByLabelText('Keterangan'), { target: { value: 'Urusan mendadak' } });
        expect(submitButton().hasAttribute('disabled')).toBe(false);
    });

    it('sends only the four payload fields with the employee code and PIN', async () => {
        setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Keperluan keluarga' }));
        fireEvent.change(screen.getByLabelText('Keterangan'), { target: { value: ' Anak sakit ' } });
        fireEvent.click(submitButton());

        await waitFor(() => expect(mockKioskRequestLeave).toHaveBeenCalledTimes(1));
        const [code, pin, input] = mockKioskRequestLeave.mock.calls[0];
        expect(code).toBe('EMP-001');
        expect(pin).toBe('1234');
        expect(Object.keys(input).sort()).toEqual(['endDate', 'note', 'reasonCode', 'startDate']);
        expect(input.reasonCode).toBe('FAMILY');
        expect(input.note).toBe('Anak sakit');
        expect(input.startDate).toBe(input.endDate);
        expect(input).not.toHaveProperty('employeeId');
    });

    it('shows the server error and keeps the dialog open', async () => {
        mockKioskRequestLeave.mockResolvedValue({ success: false, error: 'PIN yang Anda masukkan salah' });
        const onSubmitted = setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Sakit' }));
        fireEvent.click(submitButton());

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('PIN yang Anda masukkan salah');
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(onSubmitted).not.toHaveBeenCalled();
    });

    it('calls onSubmitted with the days from the server and closes', async () => {
        mockKioskRequestLeave.mockResolvedValue({ success: true, data: { id: 'l1', days: 3 } });
        const onSubmitted = setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Sakit' }));
        fireEvent.click(submitButton());

        await waitFor(() =>
            expect(onSubmitted).toHaveBeenCalledWith({ employeeName: 'Budi', days: 3 }),
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});
