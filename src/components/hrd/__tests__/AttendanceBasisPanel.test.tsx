// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { AttendanceBasisPanel } from '../AttendanceBasisPanel';
import { getPayslipAttendanceBasis } from '@/actions/hrd/payroll-monthly';

vi.mock('@/actions/hrd/payroll-monthly', () => ({
    getPayslipAttendanceBasis: vi.fn(),
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
    paidLeaveDays: 3,
    missingDays: 4,
    unlinkedLeaveDays: 0,
};

const mockedGet = vi.mocked(getPayslipAttendanceBasis);

describe('AttendanceBasisPanel', () => {
    beforeEach(() => vi.resetAllMocks());

    it('shows a loading state before the data arrives', () => {
        mockedGet.mockReturnValue(new Promise(() => {}));

        render(<AttendanceBasisPanel payslipId="ps-1" />);

        expect(screen.getByText(/Memuat dasar absensi/)).toBeTruthy();
    });

    it('shows the basis rows with the honest "current data" label', async () => {
        mockedGet.mockResolvedValue({ success: true, data: BASIS } as never);

        render(<AttendanceBasisPanel payslipId="ps-1" />);

        await waitFor(() => expect(screen.getByText('Alpa')).toBeTruthy());
        expect(screen.getByText(/berdasarkan data absensi saat ini/i)).toBeTruthy();
        expect(screen.getByTestId('basis-workingDays').textContent).toBe('26 hari');
        expect(screen.getByTestId('basis-absentDays').textContent).toBe('2 hari');
        expect(screen.getByTestId('basis-deductibleLeaveDays').textContent).toBe('1 hari');
        expect(screen.getByTestId('basis-paidLeaveDays').textContent).toBe('3 hari');
        expect(screen.getByTestId('basis-missingDays').textContent).toBe('4 hari');
        expect(screen.getByTestId('basis-dailyRate').textContent).toMatch(/120\.000/);
    });

    it('warns about workdays without records and unlinked leave when present', async () => {
        mockedGet.mockResolvedValue({
            success: true,
            data: { ...BASIS, unlinkedLeaveDays: 2 },
        } as never);

        render(<AttendanceBasisPanel payslipId="ps-1" />);

        await waitFor(() =>
            expect(screen.getByText(/4 hari kerja tanpa catatan absensi/)).toBeTruthy(),
        );
        expect(screen.getByText(/2 hari cuti tercatat tanpa pengajuan izin/)).toBeTruthy();
    });

    it('shows an error (not an empty state) when loading fails, and retries', async () => {
        mockedGet.mockResolvedValueOnce({
            success: false,
            error: 'Payslip tidak ditemukan',
            code: 'NOT_FOUND',
        } as never);
        mockedGet.mockResolvedValueOnce({ success: true, data: BASIS } as never);

        render(<AttendanceBasisPanel payslipId="ps-1" />);

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toMatch(/Payslip tidak ditemukan/),
        );
        expect(screen.queryByText(/tidak tersedia/)).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));

        await waitFor(() => expect(screen.getByText('Alpa')).toBeTruthy());
        expect(mockedGet).toHaveBeenCalledTimes(2);
    });

    it('shows an error when the request throws', async () => {
        mockedGet.mockRejectedValue(new Error('Jaringan putus'));

        render(<AttendanceBasisPanel payslipId="ps-1" />);

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toMatch(/Jaringan putus/),
        );
    });

    it('shows an empty state when the call succeeds without data', async () => {
        mockedGet.mockResolvedValue({ success: true, data: null } as never);

        render(<AttendanceBasisPanel payslipId="ps-1" />);

        await waitFor(() =>
            expect(screen.getByText(/Data dasar absensi tidak tersedia/)).toBeTruthy(),
        );
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('reloads when refreshKey changes', async () => {
        mockedGet.mockResolvedValue({ success: true, data: BASIS } as never);
        const { rerender } = render(
            <AttendanceBasisPanel payslipId="ps-1" refreshKey={0} />,
        );
        await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));

        rerender(<AttendanceBasisPanel payslipId="ps-1" refreshKey={1} />);

        await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    });
});
