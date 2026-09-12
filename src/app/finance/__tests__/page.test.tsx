// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getFinanceShiftBoard: vi.fn(),
}));

vi.mock('@/actions/dashboard/finance-dashboard', () => ({
    getFinanceShiftBoard: mocks.getFinanceShiftBoard,
}));

vi.mock('@/components/finance/finance-date-filter', () => ({
    FinanceDateFilter: () => <div>Filter tanggal</div>,
}));

import FinanceDashboardPage from '../page';

function dashboardData(arOverdueCount: number) {
    return {
        queues: {
            arOverdueCount,
            arOverdueAmount: arOverdueCount > 0 ? 100_000 : 0,
            arUnpaidCount: 2,
            apOverdueCount: 1,
            apOverdueAmount: 200_000,
            apUnpaidCount: 3,
            draftJournals: 1,
            openBankRecs: 1,
        },
        period: null,
        attention: {
            arOverdue: [],
            apOverdue: [],
            draftJournals: [],
        },
        snapshot: {
            periodLabel: 'September 2026',
            revenue: 1_000_000,
            cashPosition: 2_000_000,
            arGl: 3_000_000,
            apGl: 4_000_000,
            definitions: {
                revenue: 'akun 4xx',
                cash: 'akun 111x',
                arGl: 'akun 112x',
                apGl: 'akun 211x',
            },
        },
    };
}

describe('FinanceDashboardPage', () => {
    beforeEach(() => {
        mocks.getFinanceShiftBoard.mockResolvedValue({
            success: true,
            data: dashboardData(1),
        });
    });

    it('keeps positive-count queue cards linked to filtered targets', async () => {
        render(
            await FinanceDashboardPage({ searchParams: Promise.resolve({}) }),
        );

        expect(
            screen
                .getByText('Piutang jatuh tempo')
                .closest('a')
                ?.getAttribute('href'),
        ).toBe('/finance/invoices/sales?overdue=true');
        expect(
            screen
                .getByText('Hutang jatuh tempo')
                .closest('a')
                ?.getAttribute('href'),
        ).toBe('/finance/invoices/purchase?overdue=true');
        expect(
            screen.getByText('Jurnal draf').closest('a')?.getAttribute('href'),
        ).toBe('/finance/journals?status=DRAFT');
        expect(screen.getByText(/Ringkasan periode/)).toBeTruthy();
        expect(
            screen.queryByRole('link', { name: /laporan/i }),
        ).not.toBeTruthy();
    });

    it('shows a zero-count queue card without link semantics or hover styling', async () => {
        mocks.getFinanceShiftBoard.mockResolvedValue({
            success: true,
            data: dashboardData(0),
        });

        render(
            await FinanceDashboardPage({ searchParams: Promise.resolve({}) }),
        );

        const title = screen.getByText('Piutang jatuh tempo');
        expect(title.closest('a')).toBeNull();
        expect(
            title
                .closest('[data-slot="card"]')
                ?.classList.contains('hover:shadow-md'),
        ).toBe(false);
    });
});
