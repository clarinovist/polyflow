// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    guard: vi.fn(),
    list: vi.fn(),
    listPaid: vi.fn(),
    accounts: vi.fn(),
    requireFinanceMutation: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/sales/expense-claim-page-guard', () => ({
    guardClaimPage: m.guard,
}));
vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceMutation: m.requireFinanceMutation,
}));
vi.mock('@/actions/sales/expense-claims', () => ({
    listExpenseClaimsForPayment: m.list,
    listExpenseClaimsPaid: m.listPaid,
    payExpenseClaim: vi.fn(),
}));
vi.mock('@/actions/sales/expense-claim-accounts', () => ({
    listClaimPaymentAccounts: m.accounts,
}));

import FinanceReimbursementsPage from '../page';

const claimRow = {
    id: 'claim-1',
    claimNumber: 'RMB-202611-002',
    expenseDate: '2026-11-23T17:00:00.000Z',
    category: 'TOL',
    amount: 45000,
    description: 'Tol ke pelanggan',
    receiptUrl: '/api/images/t/expense-receipt/u/2.jpg',
    status: 'APPROVED',
    rejectionReason: null,
    salesVisit: null,
    user: { name: 'Budi Sales' },
};

const paidRow = {
    ...claimRow,
    id: 'claim-9',
    claimNumber: 'RMB-202611-009',
    status: 'PAID',
    paidAt: '2026-11-24T05:00:00.000Z',
    expenseAccount: { code: '61200', name: 'Biaya Tol' },
    paymentAccount: { code: '11110', name: 'Kas Kecil' },
    journalEntry: { entryNumber: 'JE-2026-0101' },
};
const tab = (value: string | string[] | undefined) => ({
    searchParams: Promise.resolve({ tab: value }),
});

beforeEach(() => {
    vi.clearAllMocks();
    m.guard.mockResolvedValue(undefined);
    m.list.mockResolvedValue({ success: true, data: [claimRow] });
    m.accounts.mockResolvedValue({
        success: true,
        data: {
            expenseAccounts: [],
            paymentAccounts: [],
            defaults: { expenseByCategory: {}, paymentAccountId: null },
        },
    });
    m.listPaid.mockResolvedValue({ success: true, data: [paidRow] });
});
afterEach(cleanup);

describe('Finance reimbursements page', () => {
    it('guards with the finance role check before reading anything', async () => {
        render(await FinanceReimbursementsPage());

        expect(m.guard).toHaveBeenCalledWith(m.requireFinanceMutation);
        expect(m.guard.mock.invocationCallOrder[0]).toBeLessThan(
            m.list.mock.invocationCallOrder[0],
        );
    });

    it('stops before reading claims or accounts when the guard redirects', async () => {
        m.guard.mockRejectedValue(new Error('NEXT_REDIRECT'));

        await expect(FinanceReimbursementsPage()).rejects.toThrow('NEXT_REDIRECT');

        expect(m.list).not.toHaveBeenCalled();
        expect(m.accounts).not.toHaveBeenCalled();
    });

    it('lists approved claims for payment', async () => {
        render(await FinanceReimbursementsPage());

        expect(m.list).toHaveBeenCalledWith({ take: 100 });
        expect(screen.getByRole('heading', { name: 'Reimburse Sales' })).toBeTruthy();
        expect(screen.getByText('RMB-202611-002')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Cairkan' })).toBeTruthy();
    });

    it('shows both tabs with the queue active by default', async () => {
        render(await FinanceReimbursementsPage());

        expect(
            screen.getByRole('link', { name: 'Menunggu pencairan' }).getAttribute('aria-current'),
        ).toBe('page');
        expect(
            screen.getByRole('link', { name: 'Sudah dibayar' }).getAttribute('href'),
        ).toBe('/finance/reimbursements?tab=paid');
    });

    it.each([undefined, 'queue', 'junk', 'PAID'])(
        'shows the payment queue and does not read the paid history for tab=%s',
        async (value) => {
            render(await FinanceReimbursementsPage(tab(value)));

            expect(m.list).toHaveBeenCalledWith({ take: 100 });
            expect(m.listPaid).not.toHaveBeenCalled();
            expect(screen.getByRole('button', { name: 'Cairkan' })).toBeTruthy();
        },
    );

    it('shows the paid history for tab=paid without loading the queue or the accounts', async () => {
        render(await FinanceReimbursementsPage(tab('paid')));

        expect(m.listPaid).toHaveBeenCalledWith({ take: 100 });
        expect(m.list).not.toHaveBeenCalled();
        expect(m.accounts).not.toHaveBeenCalled();
        expect(screen.getByText('RMB-202611-009')).toBeTruthy();
        expect(screen.getByText('JE-2026-0101')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Cairkan' })).toBeNull();
        expect(
            screen.getByRole('link', { name: 'Sudah dibayar' }).getAttribute('aria-current'),
        ).toBe('page');
    });

    it('guards before reading the paid history too', async () => {
        render(await FinanceReimbursementsPage(tab('paid')));

        expect(m.guard.mock.invocationCallOrder[0]).toBeLessThan(
            m.listPaid.mock.invocationCallOrder[0],
        );
    });

    it('shows the paid history error', async () => {
        m.listPaid.mockResolvedValue({ success: false, error: 'Riwayat gagal dimuat' });

        render(await FinanceReimbursementsPage(tab('paid')));

        expect(screen.getByText('Riwayat gagal dimuat')).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('says the paid history is capped when it is full', async () => {
        m.listPaid.mockResolvedValue({
            success: true,
            data: Array.from({ length: 100 }, (_, index) => ({ ...paidRow, id: `p-${index}` })),
        });

        render(await FinanceReimbursementsPage(tab('paid')));

        expect(screen.getByText('Menampilkan 100 klaim dibayar terbaru.')).toBeTruthy();
    });

    it('does not show the cap note for a short paid history', async () => {
        render(await FinanceReimbursementsPage(tab('paid')));

        expect(screen.queryByText(/Menampilkan 100/)).toBeNull();
    });

    it('says the queue is capped when it is full', async () => {
        m.list.mockResolvedValue({
            success: true,
            data: Array.from({ length: 100 }, (_, index) => ({ ...claimRow, id: `q-${index}` })),
        });

        render(await FinanceReimbursementsPage());

        expect(screen.getByText('Menampilkan 100 klaim terlama.')).toBeTruthy();
    });

    it('shows the claim list error and hides the queue', async () => {
        m.list.mockResolvedValue({ success: false, error: 'Gagal memuat antrean' });

        render(await FinanceReimbursementsPage());

        expect(screen.getByText('Gagal memuat antrean')).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('shows the account error when accounts cannot be loaded', async () => {
        m.accounts.mockResolvedValue({ success: false, error: 'Akun gagal dimuat' });

        render(await FinanceReimbursementsPage());

        expect(screen.getByText('Akun gagal dimuat')).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
    });
});
