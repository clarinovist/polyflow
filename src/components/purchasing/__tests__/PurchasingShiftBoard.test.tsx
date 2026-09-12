// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PurchasingShiftBoardComponent } from '../PurchasingShiftBoard';
import type { PurchasingShiftBoard } from '@/actions/purchasing/purchasing-types';

const data: PurchasingShiftBoard = {
    counts: {
        pendingPrs: 1,
        draftPos: 1,
        awaitingReceiptPos: 1,
        partialPos: 1,
        overdueApCount: 1,
        overdueApAmount: 250_000,
        monthlySpend: 1_000_000,
    },
    attention: {
        agingPrs: [
            { id: 'pr-1', requestNumber: 'PR-001', daysOld: 8, status: 'APPROVED' },
        ],
        draftPos: [
            { id: 'po-draft', orderNumber: 'PO-001', supplierName: 'Pemasok A', daysOld: 3 },
        ],
        awaitingReceipt: [
            { id: 'po-sent', orderNumber: 'PO-002', supplierName: 'Pemasok B' },
        ],
        partialPos: [
            { id: 'po-partial', orderNumber: 'PO-003', supplierName: 'Pemasok C' },
        ],
        overdueAp: [
            {
                id: 'invoice-1',
                invoiceNumber: 'INV-001',
                supplierName: 'Pemasok A',
                remaining: 250_000,
                dueDate: '2026-09-01',
            },
        ],
        suggestedReorder: [],
    },
    performance: {
        monthlySpend: 1_000_000,
        topSupplierName: 'Pemasok A',
        topSupplierSpend: 500_000,
    },
};

describe('PurchasingShiftBoardComponent', () => {
    it('keeps positive-count cards and action-required items linked to their targets', () => {
        render(<PurchasingShiftBoardComponent data={data} />);

        expect(
            screen.getByText('PR proses').closest('a')?.getAttribute('href'),
        ).toBe('/purchasing/requests');
        expect(
            screen
                .getAllByText('Hutang jatuh tempo')[0]
                .closest('a')
                ?.getAttribute('href'),
        ).toBe('/purchasing/invoices?overdue=true');
        expect(screen.getByText('INV-001').closest('a')?.getAttribute('href')).toBe(
            '/purchasing/invoices?overdue=true&search=INV-001',
        );
        expect(screen.getByText('PR-001').closest('a')?.getAttribute('href')).toBe(
            '/purchasing/requests?status=APPROVED',
        );
    });

    it('shows zero-count cards without link semantics, action styling, or CTA', () => {
        const zeroData: PurchasingShiftBoard = {
            ...data,
            counts: {
                ...data.counts,
                pendingPrs: 0,
            },
        };

        render(<PurchasingShiftBoardComponent data={zeroData} />);

        const title = screen.getByText('PR proses');
        expect(title.closest('a')).toBeNull();
        expect(
            title
                .closest('[data-slot="card"]')
                ?.classList.contains('cursor-pointer'),
        ).toBe(false);
        expect(screen.queryByText('Proses')).not.toBeTruthy();
    });

    it('keeps only frequent creation actions instead of a duplicate portal menu', () => {
        render(<PurchasingShiftBoardComponent data={data} />);

        expect(screen.getByRole('link', { name: 'PR' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'PO' })).toBeTruthy();
        expect(screen.queryByRole('link', { name: 'Supplier' })).not.toBeTruthy();
    });
});
