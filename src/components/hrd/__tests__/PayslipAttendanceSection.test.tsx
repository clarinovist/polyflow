// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { toast } from 'sonner';
import { PayslipAttendanceSection } from '../PayslipAttendanceSection';
import {
    getPayslipAttendanceBasis,
    recomputePayslipProration,
} from '@/actions/hrd/payroll-monthly';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/hrd/payroll-monthly', () => ({
    getPayslipAttendanceBasis: vi.fn(),
    recomputePayslipProration: vi.fn(),
}));

const BASIS = {
    payslipId: 'ps-1',
    employeeId: 'e-1',
    periodYear: 2026,
    periodMonth: 10,
    dailyRate: 120000,
    workingDays: 26,
    absentDays: 2,
    deductibleLeaveDays: 1,
    paidLeaveDays: 0,
    missingDays: 0,
    unlinkedLeaveDays: 0,
};

const mockedBasis = vi.mocked(getPayslipAttendanceBasis);
const mockedRecompute = vi.mocked(recomputePayslipProration);

function setup(status: 'DRAFT' | 'FINALIZED' | 'PAID' = 'DRAFT') {
    const onRecomputed = vi.fn();
    render(
        <PayslipAttendanceSection
            payslip={{
                id: 'ps-1',
                employeeName: 'E001 — Budi Contoh',
                status,
                prorationDeduction: 175000,
            }}
            onRecomputed={onRecomputed}
        />,
    );
    return { onRecomputed };
}

const openButton = () =>
    screen.queryByRole('button', { name: 'Hitung ulang potongan absensi' });

describe('PayslipAttendanceSection', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockedBasis.mockResolvedValue({ success: true, data: BASIS } as never);
    });

    it('shows the recompute button for DRAFT payslips', async () => {
        setup('DRAFT');

        expect(openButton()).not.toBeNull();
        await waitFor(() => expect(screen.getByText('Alpa')).toBeTruthy());
    });

    it.each(['FINALIZED', 'PAID'] as const)(
        'hides the recompute button for %s payslips but still shows the basis',
        async (status) => {
            setup(status);

            await waitFor(() => expect(screen.getByText('Alpa')).toBeTruthy());
            expect(openButton()).toBeNull();
        },
    );

    it('does not call the action when the dialog is cancelled', () => {
        setup();

        fireEvent.click(openButton()!);
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));

        expect(mockedRecompute).not.toHaveBeenCalled();
    });

    it('recomputes once, reloads the basis and notifies the parent on success', async () => {
        mockedRecompute.mockResolvedValue({ success: true, data: {} } as never);
        const { onRecomputed } = setup();
        await waitFor(() => expect(mockedBasis).toHaveBeenCalledTimes(1));

        fireEvent.click(openButton()!);
        fireEvent.click(screen.getByRole('button', { name: 'Hitung ulang' }));
        fireEvent.click(screen.getByRole('button', { name: /Hitung ulang|Memproses/ }));

        await waitFor(() => expect(onRecomputed).toHaveBeenCalledTimes(1));
        expect(mockedRecompute).toHaveBeenCalledTimes(1);
        expect(mockedRecompute).toHaveBeenCalledWith('ps-1');
        expect(toast.success).toHaveBeenCalled();
        await waitFor(() => expect(mockedBasis).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('keeps the dialog open and shows the server error on failure', async () => {
        mockedRecompute.mockResolvedValue({
            success: false,
            error: 'Hanya slip DRAFT yang bisa dihitung ulang',
            code: 'BUSINESS_RULE',
        } as never);
        const { onRecomputed } = setup();

        fireEvent.click(openButton()!);
        fireEvent.click(screen.getByRole('button', { name: 'Hitung ulang' }));

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toMatch(/slip DRAFT/),
        );
        expect(onRecomputed).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeTruthy();
    });
});
