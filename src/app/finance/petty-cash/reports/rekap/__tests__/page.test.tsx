// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RekapKasPage from '../page';

const { getReport } = vi.hoisted(() => ({ getReport: vi.fn() }));

vi.mock('@/actions/finance/petty-cash-report-actions', () => ({
    getDailyPettyCashReportAction: getReport,
}));

// Keep the real Next Link so the assertions cover its rendered anchor href.
vi.mock('@/components/ui/calendar', () => ({ Calendar: () => null }));

function transaction(overrides: Record<string, unknown> = {}) {
    return {
        id: 'journal-in:REPLENISHMENT',
        journalEntryId: 'journal-in',
        voucherNumber: 'PAY-IN-TEST-001',
        sourceDocNumber: 'INV-TEST-001',
        date: '2026-09-15T03:00:00.000Z',
        description: 'Pemasukan uji',
        amount: 200,
        type: 'REPLENISHMENT',
        status: 'POSTED',
        createdBy: { name: 'Test User' },
        ...overrides,
    };
}

function report(transactions = [transaction()], saved = false) {
    return {
        success: true,
        data: {
            date: '2026-09-15',
            openingBalance: 1000,
            totalIn: 200,
            totalOut: 50,
            closingBalance: 1150,
            transactions,
            savedReport: saved ? { id: 'report-test', status: 'FINAL' } : null,
            status: saved ? 'FINAL' : null,
        },
    };
}

beforeEach(() => {
    getReport.mockReset();
});

afterEach(cleanup);

describe('Rekap Kas voucher journal navigation', () => {
    it('links inflow and outflow vouchers to their journal IDs, preserving ledger values', async () => {
        getReport.mockResolvedValue(report([
            transaction(),
            transaction({
                id: 'journal-out:EXPENSE',
                journalEntryId: 'journal-out',
                voucherNumber: 'JE-TEST-002',
                sourceDocNumber: null,
                description: 'Pengeluaran uji',
                type: 'EXPENSE',
                amount: '50',
            }),
            transaction({
                id: 'draft-row',
                voucherNumber: 'DRAFT-TEST',
                status: 'DRAFT',
            }),
        ]));
        render(<RekapKasPage />);

        const inflow = await screen.findByRole('link', { name: 'PAY-IN-TEST-001' });
        const outflow = screen.getByRole('link', { name: 'JE-TEST-002' });
        expect(inflow.getAttribute('href')).toBe('/finance/journals/journal-in');
        expect(outflow.getAttribute('href')).toBe('/finance/journals/journal-out');
        expect(screen.getAllByRole('link')).toHaveLength(2);
        expect(screen.queryByText('DRAFT-TEST')).toBeNull();

        const rows = screen.getAllByRole('row');
        const cells = (row: HTMLElement) => within(row).getAllByRole('cell')
            .map((cell) => cell.textContent);
        expect(cells(rows[1]).slice(1)).toEqual(['', '', 'SALDO AWAL', '', '', '1.000']);
        expect(cells(rows[2]).slice(1)).toEqual([
            'INV-TEST-001', 'PAY-IN-TEST-001', 'Pemasukan uji', '200', '', '1.200',
        ]);
        expect(cells(rows[3]).slice(1)).toEqual([
            '', 'JE-TEST-002', 'Pengeluaran uji', '', '50', '1.150',
        ]);
        expect(cells(rows[4])).toEqual(['TOTAL :', '200', '50', '1.150']);
    });

    it.each([
        ['REPLENISHMENT', 'PCR-TEST-001'],
        ['EXPENSE', 'PCV-TEST-002'],
    ])('links a saved %s transaction using its journal ID, not its transaction ID', async (type, voucherNumber) => {
        getReport.mockResolvedValue(report([
            transaction({
                id: 'petty-cash-transaction-id',
                journalEntryId: 'saved-journal-id',
                voucherNumber,
                type,
            }),
        ], true));
        render(<RekapKasPage />);

        const link = await screen.findByRole('link', { name: voucherNumber });
        expect(link.getAttribute('href')).toBe('/finance/journals/saved-journal-id');
    });

    it.each([undefined, null, ''])('renders a voucher without a journal ID (%s) as plain text', async (journalEntryId) => {
        getReport.mockResolvedValue(report([transaction({ journalEntryId })], true));
        render(<RekapKasPage />);

        expect(await screen.findByText('PAY-IN-TEST-001')).toBeTruthy();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('does not render an empty link when a journal has no voucher number', async () => {
        getReport.mockResolvedValue(report([transaction({ voucherNumber: '' })]));
        render(<RekapKasPage />);

        await screen.findByText('Pemasukan uji');
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('keeps an empty report free of voucher links', async () => {
        getReport.mockResolvedValue(report([]));
        render(<RekapKasPage />);

        await screen.findByText('Tidak ada transaksi terposting pada tanggal ini');
        expect(screen.queryByRole('link')).toBeNull();
    });
});
