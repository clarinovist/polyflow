// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    guard: vi.fn(),
    list: vi.fn(),
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

beforeEach(() => {
    vi.clearAllMocks();
    m.guard.mockResolvedValue(undefined);
    m.list.mockResolvedValue({ success: true, data: [claimRow] });
    m.accounts.mockResolvedValue({
        success: true,
        data: { expenseAccounts: [], paymentAccounts: [] },
    });
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
