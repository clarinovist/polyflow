// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    guard: vi.fn(),
    list: vi.fn(),
    counts: vi.fn(),
    requireSalesManager: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/sales/expense-claim-page-guard', () => ({
    guardClaimPage: m.guard,
}));
vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesManager: m.requireSalesManager,
}));
vi.mock('@/actions/sales/expense-claims', () => ({
    listExpenseClaimsForReview: m.list,
    getExpenseClaimCounts: m.counts,
    approveExpenseClaim: vi.fn(),
    rejectExpenseClaim: vi.fn(),
}));

import SalesClaimsPage from '../page';

const claimRow = {
    id: 'claim-1',
    claimNumber: 'RMB-202611-001',
    expenseDate: '2026-11-23T17:00:00.000Z',
    category: 'BBM',
    amount: 125000,
    description: 'Bensin kunjungan',
    receiptUrl: '/api/images/t/expense-receipt/u/1.jpg',
    status: 'SUBMITTED',
    rejectionReason: null,
    salesVisit: { customer: { name: 'Toko Contoh' } },
    user: { name: 'Budi Sales' },
};

function params(status?: string | string[]) {
    return { searchParams: Promise.resolve({ status }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    m.guard.mockResolvedValue(undefined);
    m.list.mockResolvedValue({ success: true, data: [claimRow] });
    m.counts.mockResolvedValue({
        success: true,
        data: { submitted: 3, approved: 1 },
    });
});
afterEach(cleanup);

describe('Sales claims review page', () => {
    it('guards with the manager role check before reading any claim', async () => {
        render(await SalesClaimsPage(params()));

        expect(m.guard).toHaveBeenCalledWith(m.requireSalesManager);
        expect(m.guard.mock.invocationCallOrder[0]).toBeLessThan(
            m.list.mock.invocationCallOrder[0],
        );
    });

    it('stops before reading claims when the guard redirects a non-manager', async () => {
        m.guard.mockRejectedValue(new Error('NEXT_REDIRECT'));

        await expect(SalesClaimsPage(params())).rejects.toThrow(
            'NEXT_REDIRECT',
        );

        expect(m.list).not.toHaveBeenCalled();
        expect(m.counts).not.toHaveBeenCalled();
    });

    it('lists waiting claims by default and shows the pending counter', async () => {
        render(await SalesClaimsPage(params()));

        expect(m.list).toHaveBeenCalledWith({ status: 'SUBMITTED', take: 100 });
        expect(screen.getByRole('heading', { name: 'Klaim Reimburse' })).toBeTruthy();
        expect(screen.getByText('RMB-202611-001')).toBeTruthy();
        expect(screen.getByRole('link', { name: /Menunggu/ }).textContent).toContain('3');
    });

    it('uses the requested status and ignores an invalid one', async () => {
        render(await SalesClaimsPage(params('PAID')));
        expect(m.list).toHaveBeenLastCalledWith({ status: 'PAID', take: 100 });
        cleanup();

        render(await SalesClaimsPage(params('bogus')));
        expect(m.list).toHaveBeenLastCalledWith({ status: 'SUBMITTED', take: 100 });
    });

    it('shows the server error instead of the table when the list fails', async () => {
        m.list.mockResolvedValue({ success: false, error: 'Gagal memuat klaim' });

        render(await SalesClaimsPage(params()));

        expect(screen.getByText('Gagal memuat klaim')).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('still renders when the counter cannot be loaded', async () => {
        m.counts.mockResolvedValue({ success: false, error: 'x' });

        render(await SalesClaimsPage(params()));

        expect(screen.getByText('RMB-202611-001')).toBeTruthy();
    });
});
