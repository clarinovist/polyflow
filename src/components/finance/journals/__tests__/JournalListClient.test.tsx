// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getJournalEntries = vi.hoisted(() => vi.fn());
const batchPostJournals = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/actions/finance/journal-actions', () => ({
    getJournalEntries,
    batchPostJournals,
}));
vi.mock('@/hooks/use-debounce', () => ({
    useDebounce: (value: string) => value,
}));
vi.mock('@/components/common/transaction-date-filter', () => ({
    TransactionDateFilter: () => <button type="button">Filter tanggal</button>,
}));

import { JournalListClient } from '../JournalListClient';

describe('JournalListClient accessibility', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getJournalEntries.mockResolvedValue({
            success: true,
            data: {
                data: [],
                meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
            },
        });
    });

    it('uses semantic headings and programmatic filter labels', async () => {
        render(<JournalListClient />);
        await waitFor(() => expect(getJournalEntries).toHaveBeenCalled());

        expect(screen.getByRole('heading', { level: 1, name: 'Jurnal' })).toBeTruthy();
        expect(
            screen.getByRole('heading', { level: 2, name: 'Filter Transaksi' }),
        ).toBeTruthy();
        expect(
            screen.getByRole('heading', { level: 2, name: 'Riwayat Transaksi' }),
        ).toBeTruthy();
        expect(screen.getByLabelText('Cari jurnal')).toBeTruthy();
        expect(screen.getByLabelText('Status jurnal')).toBeTruthy();
        expect(
            screen.getByRole('navigation', { name: 'Paginasi jurnal' }),
        ).toBeTruthy();
        expect(screen.getByLabelText('Baris per halaman')).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Halaman berikutnya' }),
        ).toBeTruthy();
    });

    it('names the table and exposes keyboard-operable server sort semantics', async () => {
        render(<JournalListClient />);
        await waitFor(() => expect(getJournalEntries).toHaveBeenCalled());

        const table = screen.getByRole('table', { name: 'Riwayat jurnal' });
        const dateHeader = screen.getByRole('columnheader', { name: 'Date' });
        const entryHeader = screen.getByRole('columnheader', {
            name: 'Entry #',
        });
        expect(dateHeader.getAttribute('aria-sort')).toBe('descending');
        expect(entryHeader.hasAttribute('aria-sort')).toBe(false);
        expect(
            screen.getByRole('button', {
                name: 'Urutkan berdasarkan Entry #',
            }),
        ).toBeTruthy();
        expect(
            table.closest('[data-journal-scroll]')?.className,
        ).toContain('overflow-y-auto');
    });

    it('resets page and requests server sorting before pagination', async () => {
        getJournalEntries.mockResolvedValue({
            success: true,
            data: {
                data: [],
                meta: { total: 21, page: 2, limit: 20, totalPages: 2 },
            },
        });
        render(<JournalListClient />);
        await screen.findByText('Halaman 2 dari 2');
        getJournalEntries.mockClear();
        getJournalEntries.mockResolvedValue({
            success: true,
            data: {
                data: [],
                meta: { total: 21, page: 1, limit: 20, totalPages: 2 },
            },
        });

        fireEvent.click(
            screen.getByRole('button', {
                name: 'Urutkan berdasarkan Entry #',
            }),
        );

        await waitFor(() =>
            expect(getJournalEntries).toHaveBeenCalledWith(
                expect.objectContaining({
                    page: 1,
                    limit: 20,
                    sortBy: 'entryNumber',
                    sortDirection: 'asc',
                }),
            ),
        );
        expect(
            screen
                .getByRole('columnheader', { name: 'Entry #' })
                .getAttribute('aria-sort'),
        ).toBe('ascending');

        getJournalEntries.mockClear();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Urutkan berdasarkan Entry #',
            }),
        );
        await waitFor(() =>
            expect(getJournalEntries).toHaveBeenCalledWith(
                expect.objectContaining({
                    page: 1,
                    sortBy: 'entryNumber',
                    sortDirection: 'desc',
                }),
            ),
        );
    });

    it('adopts the clamped server page returned by pagination metadata', async () => {
        getJournalEntries.mockResolvedValue({
            success: true,
            data: {
                data: [],
                meta: { total: 21, page: 2, limit: 20, totalPages: 2 },
            },
        });

        render(<JournalListClient />);

        expect(await screen.findByText('Halaman 2 dari 2')).toBeTruthy();
    });
});
