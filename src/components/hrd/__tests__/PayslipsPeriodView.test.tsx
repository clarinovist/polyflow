// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { PayslipsPeriodView } from '../PayslipsPeriodView';
import {
    listPayslipsForPeriod,
    getPayslipAttendanceBasis,
} from '@/actions/hrd/payroll-monthly';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));
vi.mock('@/actions/hrd/payroll-monthly', () => ({
    listPayslipsForPeriod: vi.fn(),
    finalizePayslip: vi.fn(),
    markPayslipPaid: vi.fn(),
    closePayrollPeriod: vi.fn(),
    updateDraftPayslip: vi.fn(),
    getPayslipAttendanceBasis: vi.fn(),
    recomputePayslipProration: vi.fn(),
}));

function slip(id: string, name: string, status: 'DRAFT' | 'FINALIZED') {
    return {
        id,
        employeeId: `emp-${id}`,
        baseSalary: 3000000,
        allowanceTotal: 0,
        thrAmount: 0,
        prorationDeduction: 120000,
        grossPay: 3000000,
        bpjsDeduction: 0,
        loanDeduction: 0,
        otherDeductions: 0,
        deductionTotal: 120000,
        netPay: 2880000,
        status,
        notes: null,
        employee: { code: 'E001', name },
        allowances: [],
        loanPayments: [],
    };
}

describe('PayslipsPeriodView — potongan absensi', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(listPayslipsForPeriod).mockResolvedValue({
            success: true,
            data: [slip('d-1', 'Budi Draft', 'DRAFT'), slip('f-1', 'Siti Final', 'FINALIZED')],
        } as never);
        vi.mocked(getPayslipAttendanceBasis).mockResolvedValue({
            success: true,
            data: null,
        } as never);
    });

    it('uses the attendance deduction label instead of "Prorata"', async () => {
        render(<PayslipsPeriodView periodId="per-1" />);

        await waitFor(() => expect(screen.getByText(/Budi Draft/)).toBeTruthy());

        expect(screen.getByText('Potongan absensi')).toBeTruthy();
        expect(screen.queryByText('Prorata')).toBeNull();
    });

    it('shows the basis panel and recompute button in a DRAFT detail', async () => {
        render(<PayslipsPeriodView periodId="per-1" />);
        await waitFor(() => expect(screen.getByText(/Budi Draft/)).toBeTruthy());

        fireEvent.click(screen.getByText(/Budi Draft/));

        expect(screen.getByText('Dasar absensi')).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Hitung ulang potongan absensi' }),
        ).toBeTruthy();
        expect(
            screen.getByText('Potongan absensi (alpa & izin tidak dibayar)'),
        ).toBeTruthy();
    });

    it('shows the basis panel but no recompute button in a FINALIZED detail', async () => {
        render(<PayslipsPeriodView periodId="per-1" />);
        await waitFor(() => expect(screen.getByText(/Siti Final/)).toBeTruthy());

        fireEvent.click(screen.getByText(/Siti Final/));

        expect(screen.getByText('Dasar absensi')).toBeTruthy();
        expect(
            screen.queryByRole('button', { name: 'Hitung ulang potongan absensi' }),
        ).toBeNull();
    });
});
