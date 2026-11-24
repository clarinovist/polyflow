// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/actions/sales/expense-claims', () => ({
    approveExpenseClaim: vi.fn(),
    rejectExpenseClaim: vi.fn(),
}));

import type { ClaimReviewItem } from '@/lib/sales/expense-claim-review';
import { ClaimReviewTable } from '../ClaimReviewTable';
import { ClaimStatusTabs } from '../ClaimStatusTabs';

function claim(overrides: Partial<ClaimReviewItem> = {}): ClaimReviewItem {
    return {
        id: 'claim-1',
        claimNumber: 'RMB-202611-001',
        expenseDate: '2026-11-23T17:00:00.000Z', // 24 Nov 2026 WIB
        category: 'BBM',
        amount: 125000,
        description: 'Bensin kunjungan',
        receiptUrl: '/api/images/t/expense-receipt/u/1.jpg',
        status: 'SUBMITTED',
        rejectionReason: null,
        salesVisit: null,
        user: { name: 'Budi Sales' },
        ...overrides,
    };
}

afterEach(cleanup);

describe('ClaimReviewTable', () => {
    it('shows an empty message naming the selected tab', () => {
        render(<ClaimReviewTable claims={[]} status="REJECTED" />);

        expect(screen.getByText('Tidak ada klaim berstatus "Ditolak".')).toBeTruthy();
    });

    it('renders number, submitter, WIB date, category, amount, note, customer and receipt link', () => {
        render(
            <ClaimReviewTable
                claims={[claim({ salesVisit: { customer: { name: 'Toko Contoh' } } })]}
                status="SUBMITTED"
            />,
        );

        expect(screen.getByText('RMB-202611-001')).toBeTruthy();
        expect(screen.getByText('Budi Sales')).toBeTruthy();
        expect(screen.getByText('24 Nov 2026')).toBeTruthy();
        expect(screen.getByText('BBM')).toBeTruthy();
        expect(screen.getByText(/125\.000/)).toBeTruthy();
        expect(screen.getByText('Bensin kunjungan')).toBeTruthy();
        expect(screen.getByText('Kunjungan: Toko Contoh')).toBeTruthy();
        const link = screen.getByRole('link', { name: /Lihat nota/ });
        expect(link.getAttribute('href')).toBe('/api/images/t/expense-receipt/u/1.jpg');
        expect(link.getAttribute('target')).toBe('_blank');
    });

    it('offers approve and reject only for claims still waiting', () => {
        render(<ClaimReviewTable claims={[claim()]} status="SUBMITTED" />);

        expect(screen.getByRole('button', { name: 'Setujui' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Tolak' })).toBeTruthy();
    });

    it('shows a status badge and the rejection reason instead of actions on other tabs', () => {
        render(
            <ClaimReviewTable
                claims={[
                    claim({
                        status: 'REJECTED',
                        rejectionReason: 'Nota tidak terbaca',
                    }),
                ]}
                status="REJECTED"
            />,
        );

        expect(screen.queryByRole('button', { name: 'Setujui' })).toBeNull();
        expect(screen.getByText('Ditolak')).toBeTruthy();
        expect(screen.getByText('Alasan ditolak: Nota tidak terbaca')).toBeTruthy();
    });

    it('falls back to a dash when the submitter name is missing', () => {
        render(
            <ClaimReviewTable
                claims={[claim({ user: { name: null } })]}
                status="SUBMITTED"
            />,
        );

        expect(screen.getByText('-')).toBeTruthy();
    });
});

describe('ClaimStatusTabs', () => {
    it('links every tab with its status and marks the active one', () => {
        render(<ClaimStatusTabs active="APPROVED" pendingCount={4} />);

        const approved = screen.getByRole('link', { name: 'Disetujui' });
        expect(approved.getAttribute('aria-current')).toBe('page');
        expect(approved.getAttribute('href')).toBe('/sales/claims?status=APPROVED');
        expect(
            screen.getByRole('link', { name: /Dibayar/ }).getAttribute('href'),
        ).toBe('/sales/claims?status=PAID');
    });

    it('shows the pending counter only on the waiting tab', () => {
        render(<ClaimStatusTabs active="SUBMITTED" pendingCount={4} />);

        expect(screen.getByRole('link', { name: /Menunggu/ }).textContent).toContain('4');
        expect(screen.getByRole('link', { name: 'Ditolak' }).textContent).toBe('Ditolak');
    });

    it('hides the counter when it is unknown', () => {
        render(<ClaimStatusTabs active="SUBMITTED" pendingCount={null} />);

        expect(screen.getByRole('link', { name: 'Menunggu' })).toBeTruthy();
    });
});
