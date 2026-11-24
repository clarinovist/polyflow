// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ list: vi.fn(), visits: vi.fn() }));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/actions/sales/expense-claims', () => ({
    listMyExpenseClaims: m.list,
    submitExpenseClaim: vi.fn(),
    cancelExpenseClaim: vi.fn(),
}));
vi.mock('@/actions/sales/route-plans', () => ({
    getServerVisits: m.visits,
}));

import SalesMobileClaimsPage from '../page';

const claimRow = {
    id: 'claim-1',
    claimNumber: 'RMB-202611-001',
    expenseDate: '2026-11-23T17:00:00.000Z',
    category: 'PARKIR',
    amount: 5000,
    description: 'Parkir toko',
    receiptUrl: '/api/images/t/expense-receipt/u/1.jpg',
    status: 'APPROVED',
    rejectionReason: null,
    salesVisit: null,
};

function params(visitId?: string | string[]) {
    return { searchParams: Promise.resolve({ visitId }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    m.list.mockResolvedValue({ success: true, data: [claimRow] });
    m.visits.mockResolvedValue({
        success: true,
        data: [
            {
                id: 'visit-1',
                customerName: 'Toko Contoh',
                checkInTime: '2026-11-23T17:30:00.000Z',
            },
        ],
    });
});
afterEach(cleanup);

describe('Sales claims page', () => {
    it('renders the form and the claim history', async () => {
        render(await SalesMobileClaimsPage(params()));

        expect(screen.getByRole('heading', { name: 'Klaim Nota' })).toBeTruthy();
        expect(screen.getByRole('form', { name: 'Form klaim nota' })).toBeTruthy();
        expect(screen.getByText('RMB-202611-001')).toBeTruthy();
        expect(screen.queryByText(/Terkait kunjungan/)).toBeNull();
        expect(m.visits).not.toHaveBeenCalled();
    });

    it('labels the linked visit from the visitId query param', async () => {
        render(await SalesMobileClaimsPage(params('visit-1')));
        expect(
            screen.getByText('Terkait kunjungan: Toko Contoh, 24 Nov 2026'),
        ).toBeTruthy();
    });

    it('uses the first value when visitId is repeated', async () => {
        render(await SalesMobileClaimsPage(params(['visit-1', 'visit-2'])));
        expect(screen.getByText(/Toko Contoh/)).toBeTruthy();
    });

    it('shows a generic visit note when the visit is not among the recent ones', async () => {
        render(await SalesMobileClaimsPage(params('visit-old')));
        expect(screen.getByText('Terkait kunjungan')).toBeTruthy();
    });

    it('still renders when the visit lookup fails', async () => {
        m.visits.mockResolvedValue({ success: false, error: 'x', code: 'X' });
        render(await SalesMobileClaimsPage(params('visit-1')));
        expect(screen.getByText('Terkait kunjungan')).toBeTruthy();
    });

    it('shows a read error with retry when the claims cannot be loaded', async () => {
        m.list.mockResolvedValue({ success: false, error: 'x', code: 'X' });
        render(await SalesMobileClaimsPage(params()));
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeTruthy();
    });
});
