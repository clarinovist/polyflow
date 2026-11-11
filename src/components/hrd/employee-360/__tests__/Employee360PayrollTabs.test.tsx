// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { Employee360PayrollMonthlyTab } from '../Employee360PayrollMonthlyTab';
import { Employee360PayrollWeeklyTab } from '../Employee360PayrollWeeklyTab';
import {
    listPayslipsByEmployee,
    listActiveAllowances,
} from '@/actions/hrd/payslips-employee';
import { getEmployeeWeeklyPayroll } from '@/actions/hrd/payroll';

vi.mock('@/actions/hrd/payslips-employee', () => ({
    listPayslipsByEmployee: vi.fn(),
    listActiveAllowances: vi.fn(),
}));
vi.mock('@/actions/hrd/payroll', () => ({
    getEmployeeWeeklyPayroll: vi.fn(),
}));

const RAW_ENUMS = [
    'DRAFT',
    'FINALIZED',
    'PAID',
    'PRESENT',
    'ABSENT',
    'ON_LEAVE',
    'Rate Missing',
    'Prorata',
    'Kg Exception',
];

function expectNoRawEnums(container: HTMLElement) {
    const texts = Array.from(container.querySelectorAll('*'))
        .filter((el) => el.children.length === 0)
        .map((el) => el.textContent?.trim() ?? '');
    for (const raw of RAW_ENUMS) {
        expect(texts).not.toContain(raw);
    }
}

function payslip(id: string, status: string, month: number) {
    return {
        id,
        employeeId: 'e-1',
        baseSalary: 1000,
        allowanceTotal: 0,
        thrAmount: 0,
        prorationDeduction: 0,
        grossPay: 1000,
        bpjsDeduction: 0,
        loanDeduction: 0,
        otherDeductions: 0,
        deductionTotal: 0,
        netPay: 1000,
        status,
        payrollPeriod: { id: `p-${id}`, year: 2026, month, status: 'OPEN' },
    };
}

describe('Employee360PayrollMonthlyTab labels', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(listActiveAllowances).mockResolvedValue({
            success: true,
            data: [],
        } as never);
        vi.mocked(listPayslipsByEmployee).mockResolvedValue({
            success: true,
            data: [
                payslip('a', 'DRAFT', 1),
                payslip('b', 'FINALIZED', 2),
                payslip('c', 'PAID', 3),
            ],
        } as never);
    });

    it('uses "Potongan absensi" and Indonesian payslip status labels', async () => {
        const { container } = render(
            <Employee360PayrollMonthlyTab employeeId="e-1" />,
        );
        await waitFor(() => expect(screen.getByText('Januari 2026')).toBeTruthy());

        expect(screen.getByText('Potongan absensi')).toBeTruthy();
        expect(screen.getByText('Draf')).toBeTruthy();
        expect(screen.getByText('Difinalisasi')).toBeTruthy();
        expect(screen.getByText('Dibayar')).toBeTruthy();
        expectNoRawEnums(container);
    });
});

function weekly(overrides: Record<string, unknown>) {
    return {
        employeeId: 'e-1',
        employeeName: 'Budi Contoh',
        employeeCode: 'EMP-001',
        payType: 'DAILY',
        weekStart: new Date('2026-05-04T00:00:00Z'),
        weekEnd: new Date('2026-05-10T00:00:00Z'),
        daysWorked: 1,
        daysAbsent: 1,
        totalActualHours: 8,
        totalOvertimeHours: 0,
        totalDailyEarnings: 100,
        totalOvertimeEarnings: 0,
        totalPieceEarnings: 0,
        totalKgPaid: 0,
        totalKgUnpaid: 0,
        totalEarnings: 100,
        bpjsDeduction: 0,
        isBpjsWeek: false,
        netPay: 100,
        records: [],
        pieceLines: [],
        exceptions: [],
        ...overrides,
    };
}

describe('Employee360PayrollWeeklyTab labels', () => {
    beforeEach(() => vi.resetAllMocks());

    it('renders attendance statuses in Indonesian', async () => {
        const record = (status: string) => ({
            date: new Date('2026-05-04T00:00:00Z'),
            shiftName: `Shift ${status}`,
            status,
            actualHours: 8,
            overtimeHours: 0,
            dailyEarnings: 100,
            overtimeEarnings: 0,
            totalEarnings: 100,
        });
        vi.mocked(getEmployeeWeeklyPayroll).mockResolvedValue({
            success: true,
            data: weekly({
                records: [record('PRESENT'), record('ABSENT'), record('ON_LEAVE')],
            }),
        } as never);

        const { container } = render(
            <Employee360PayrollWeeklyTab employeeId="e-1" />,
        );
        await waitFor(() => expect(screen.getByText('Shift PRESENT')).toBeTruthy());

        expect(screen.getByText('Hadir')).toBeTruthy();
        expect(screen.getByText('Alfa')).toBeTruthy();
        expect(screen.getByText('Izin')).toBeTruthy();
        expectNoRawEnums(container);
    });

    it('labels missing piece rate and unpaid kg in Indonesian', async () => {
        vi.mocked(getEmployeeWeeklyPayroll).mockResolvedValue({
            success: true,
            data: weekly({
                payType: 'PIECE',
                totalKgUnpaid: 12,
                pieceLines: [
                    {
                        executionId: 'x-1',
                        date: new Date('2026-05-04T00:00:00Z'),
                        machineType: 'EXTRUDER',
                        quantityKg: 12,
                        ratePerKg: null,
                        pieceEarnings: null,
                        paid: false,
                        reason: 'NO_RATE',
                    },
                ],
            }),
        } as never);

        const { container } = render(
            <Employee360PayrollWeeklyTab employeeId="e-1" />,
        );
        await waitFor(() =>
            expect(screen.getByText('Tarif belum diatur')).toBeTruthy(),
        );

        expect(screen.getByText('Kg Belum Dibayar')).toBeTruthy();
        expectNoRawEnums(container);
    });
});
