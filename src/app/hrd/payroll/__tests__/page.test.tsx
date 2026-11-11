// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PayrollPage from '../page';
import { getAllWeeklyPayroll } from '@/actions/hrd/payroll';

vi.mock('@/actions/hrd/payroll', () => ({
    getAllWeeklyPayroll: vi.fn(),
}));
vi.mock('@/components/common/url-week-picker', () => ({
    UrlWeekPicker: () => <div data-testid="week-picker" />,
}));

function row(overrides: Record<string, unknown> = {}) {
    return {
        employeeId: 'e-1',
        employeeName: 'Fiktif Satu',
        employeeCode: 'EMP-1',
        payType: 'DAILY',
        weekStart: '2026-07-13T00:00:00.000Z',
        weekEnd: '2026-07-19T23:59:59.999Z',
        daysWorked: 3,
        daysAbsent: 0,
        totalActualHours: 8,
        totalOvertimeHours: 0,
        totalDailyEarnings: 120000,
        totalOvertimeEarnings: 0,
        totalPieceEarnings: 0,
        totalKgPaid: 0,
        totalKgUnpaid: 0,
        totalEarnings: 120000,
        bpjsDeduction: 0,
        isBpjsWeek: false,
        netPay: 120000,
        records: [],
        pieceLines: [],
        exceptions: [],
        incompleteDays: 0,
        incompleteDates: [],
        ...overrides,
    };
}

async function renderPage(rows: unknown[]) {
    vi.mocked(getAllWeeklyPayroll).mockResolvedValue({
        success: true,
        data: rows,
    } as never);
    render(await PayrollPage({ searchParams: Promise.resolve({}) }));
}

describe('PayrollPage incomplete days warning', () => {
    beforeEach(() => vi.resetAllMocks());

    it('shows no warning when nobody has incomplete days', async () => {
        await renderPage([row(), row({ employeeId: 'e-2' })]);

        expect(screen.queryByText(/tanpa jam pulang/)).toBeNull();
    });

    it('counts employees with incomplete days and links to the stale list', async () => {
        await renderPage([
            row({ incompleteDays: 2, incompleteDates: ['2026-07-14', '2026-07-15'] }),
            row({ employeeId: 'e-2', employeeCode: 'EMP-2', incompleteDays: 1, incompleteDates: ['2026-07-16'] }),
            row({ employeeId: 'e-3', employeeCode: 'EMP-3' }),
        ]);

        expect(
            screen.getByText(/2 karyawan harian punya hari tanpa jam pulang/),
        ).toBeTruthy();
        const link = screen.getByRole('link', { name: /Sesi belum pulang/ });
        expect(link.getAttribute('href')).toBe('/hrd/attendance?status=stale');
    });

    it('shows a per-row badge only for employees with incomplete days', async () => {
        await renderPage([
            row({ incompleteDays: 2, incompleteDates: ['2026-07-14', '2026-07-15'] }),
            row({ employeeId: 'e-2', employeeCode: 'EMP-2' }),
        ]);

        expect(screen.getAllByText('2 hari tanpa jam pulang')).toHaveLength(1);
    });

    it('leaves existing totals untouched', async () => {
        await renderPage([
            row({ incompleteDays: 1, incompleteDates: ['2026-07-14'] }),
        ]);

        expect(screen.getAllByText(/120\.000/).length).toBeGreaterThan(0);
        expect(screen.getByText('Total (1 karyawan)')).toBeTruthy();
    });
});
