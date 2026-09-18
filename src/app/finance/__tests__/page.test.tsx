// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getFinanceShiftBoard: vi.fn(),
    getFinanceSalesReturnSummary: vi.fn(),
}));

vi.mock('@/actions/dashboard/finance-dashboard', () => ({
    getFinanceShiftBoard: mocks.getFinanceShiftBoard,
}));

vi.mock('@/actions/finance/sales-returns', () => ({
    getFinanceSalesReturnSummary: mocks.getFinanceSalesReturnSummary,
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
        mocks.getFinanceSalesReturnSummary.mockResolvedValue({ success: true, data: { count: 0, draftCount: 0, confirmedCount: 0, receivedCount: 0, documentAmount: 0 } });
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

    it('shows pending drafts and does not claim all queues are clean', async () => {
        const data = dashboardData(0);
        Object.assign(data.queues, { apOverdueCount: 0, draftJournals: 0, openBankRecs: 0 });
        mocks.getFinanceShiftBoard.mockResolvedValue({ success: true, data });
        mocks.getFinanceSalesReturnSummary.mockResolvedValue({ success: true, data: { count: 2, draftCount: 2, confirmedCount: 0, receivedCount: 0, documentAmount: 300 } });
        render(await FinanceDashboardPage({ searchParams: Promise.resolve({ startDate: '2026-01-01', endDate: '2026-01-31' }) }));
        expect(screen.getByText(/2 draft/)).toBeTruthy();
        expect(screen.queryByText(/Semua antrean bersih/)).toBeNull();
        expect(screen.getByRole('link', { name: 'Lihat retur penjualan' }).getAttribute('href')).toBe('/finance/returns');
        expect(mocks.getFinanceSalesReturnSummary).toHaveBeenCalledWith();
    });

    it('never treats a failed return query as an empty queue', async () => {
        mocks.getFinanceSalesReturnSummary.mockResolvedValue({ success: false, error: 'denied' });
        render(await FinanceDashboardPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole('alert').textContent).toContain('tidak tersedia');
        expect(screen.queryByText(/Semua antrean bersih/)).toBeNull();
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
