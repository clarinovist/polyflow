// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { PayrollMonthlyManager } from '../PayrollMonthlyManager';
import {
    generatePayslips,
    listPayrollPeriods,
} from '@/actions/hrd/payroll-monthly';

const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/hrd/payroll-monthly', () => ({
    listPayrollPeriods: vi.fn(),
    generatePayslips: vi.fn(),
}));

const mockedGenerate = vi.mocked(generatePayslips);

const WARNINGS = [
    { employeeId: 'e-1', employeeName: 'Budi Contoh', missingDays: 3 },
];

async function generate() {
    render(<PayrollMonthlyManager />);
    await waitFor(() => expect(listPayrollPeriods).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Generate Periode' }));
    fireEvent.click(screen.getByRole('button', { name: /^Generate \w+ \d{4}$/ }));
}

describe('PayrollMonthlyManager — peringatan generate', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(listPayrollPeriods).mockResolvedValue({
            success: true,
            data: [],
        } as never);
    });

    it('shows the warnings dialog and delays navigation until it is closed', async () => {
        mockedGenerate.mockResolvedValue({
            success: true,
            data: { created: 2, skipped: 0, periodId: 'per-1', warnings: WARNINGS },
        } as never);

        await generate();

        await waitFor(() =>
            expect(
                screen.getByText(/1 karyawan punya hari kerja tanpa catatan absensi/),
            ).toBeTruthy(),
        );
        expect(push).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Mengerti' }));

        expect(push).toHaveBeenCalledWith('/hrd/payroll-monthly/per-1');
    });

    it('navigates straight away when there are no warnings', async () => {
        mockedGenerate.mockResolvedValue({
            success: true,
            data: { created: 2, skipped: 0, periodId: 'per-1', warnings: [] },
        } as never);

        await generate();

        await waitFor(() =>
            expect(push).toHaveBeenCalledWith('/hrd/payroll-monthly/per-1'),
        );
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('navigates straight away when the result carries no warnings field', async () => {
        mockedGenerate.mockResolvedValue({
            success: true,
            data: { created: 2, skipped: 0, periodId: 'per-1' },
        } as never);

        await generate();

        await waitFor(() =>
            expect(push).toHaveBeenCalledWith('/hrd/payroll-monthly/per-1'),
        );
    });
});
