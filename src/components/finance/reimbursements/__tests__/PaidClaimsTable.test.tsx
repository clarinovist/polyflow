// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PaidClaimItem } from '@/lib/sales/expense-claim-review';
import { PaidClaimsTable } from '../PaidClaimsTable';

function paid(overrides: Partial<PaidClaimItem> = {}): PaidClaimItem {
    return {
        id: 'claim-1',
        claimNumber: 'RMB-202611-002',
        expenseDate: '2026-11-23T17:00:00.000Z',
        category: 'TOL',
        amount: 45000,
        description: 'Tol ke pelanggan',
        receiptUrl: '/api/images/t/expense-receipt/u/2.jpg',
        status: 'PAID',
        rejectionReason: null,
        salesVisit: null,
        user: { name: 'Budi Sales' },
        paidAt: '2026-11-24T05:00:00.000Z', // 24 Nov 2026 12:00 WIB
        expenseAccount: { code: '61200', name: 'Biaya Tol' },
        paymentAccount: { code: '11110', name: 'Kas Kecil' },
        journalEntry: { entryNumber: 'JE-2026-0101' },
        ...overrides,
    };
}

afterEach(cleanup);

describe('PaidClaimsTable', () => {
    it('shows an empty message when nothing has been paid', () => {
        render(<PaidClaimsTable claims={[]} />);

        expect(screen.getByText('Belum ada klaim yang dibayar.')).toBeTruthy();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('lists number, submitter, WIB paid date, category, amount, both accounts, journal and receipt link', () => {
        render(<PaidClaimsTable claims={[paid()]} />);

        const row = within(screen.getAllByRole('row')[1]);
        expect(row.getByText('RMB-202611-002')).toBeTruthy();
        expect(row.getByText('Budi Sales')).toBeTruthy();
        expect(row.getByText('24 Nov 2026')).toBeTruthy();
        expect(row.getByText('Tol')).toBeTruthy();
        expect(row.getByText(/45\.000/)).toBeTruthy();
        expect(row.getByText('61200 · Biaya Tol')).toBeTruthy();
        expect(row.getByText('11110 · Kas Kecil')).toBeTruthy();
        expect(row.getByText('JE-2026-0101')).toBeTruthy();
        expect(row.getByRole('link', { name: /Lihat nota/ }).getAttribute('href')).toBe(
            '/api/images/t/expense-receipt/u/2.jpg',
        );
    });

    it('shows the paid date in WIB even when the UTC date is the day before', () => {
        render(<PaidClaimsTable claims={[paid({ paidAt: '2026-11-24T20:00:00.000Z' })]} />);

        expect(screen.getByText('25 Nov 2026')).toBeTruthy();
    });

    it('falls back to dashes for missing submitter, accounts, journal and paid date', () => {
        render(
            <PaidClaimsTable
                claims={[
                    paid({
                        user: null,
                        paidAt: null,
                        expenseAccount: null,
                        paymentAccount: null,
                        journalEntry: null,
                    }),
                ]}
            />,
        );

        expect(within(screen.getAllByRole('row')[1]).getAllByText('-')).toHaveLength(5);
    });

    it('renders one row per claim in the given order', () => {
        render(
            <PaidClaimsTable
                claims={[
                    paid({ id: 'a', claimNumber: 'RMB-202611-009' }),
                    paid({ id: 'b', claimNumber: 'RMB-202611-003' }),
                ]}
            />,
        );

        const numbers = screen
            .getAllByRole('row')
            .slice(1)
            .map((row) => within(row).getAllByRole('cell')[0].textContent);
        expect(numbers).toEqual(['RMB-202611-009', 'RMB-202611-003']);
    });
});
