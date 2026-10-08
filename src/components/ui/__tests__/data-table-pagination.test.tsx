// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DataTablePagination } from '../data-table-pagination';

Element.prototype.scrollIntoView = vi.fn();

describe('DataTablePagination', () => {
    it('names the pagination region and every navigation control', () => {
        const onFirstPage = vi.fn();
        const onPreviousPage = vi.fn();
        const onNextPage = vi.fn();
        const onLastPage = vi.fn();

        render(
            <DataTablePagination
                pageIndex={1}
                pageCount={3}
                canPreviousPage
                canNextPage
                onFirstPage={onFirstPage}
                onPreviousPage={onPreviousPage}
                onNextPage={onNextPage}
                onLastPage={onLastPage}
            />,
        );

        expect(
            screen.getByRole('navigation', { name: 'Paginasi tabel' }),
        ).toBeTruthy();
        expect(screen.getByText('Halaman 2 dari 3')).toBeTruthy();

        const controls = [
            ['Halaman pertama', onFirstPage],
            ['Halaman sebelumnya', onPreviousPage],
            ['Halaman berikutnya', onNextPage],
            ['Halaman terakhir', onLastPage],
        ] as const;

        for (const [name, handler] of controls) {
            const button = screen.getByRole('button', { name });
            expect(button.className).toContain('h-11');
            expect(button.className).toContain('w-11');
            fireEvent.click(button);
            expect(handler).toHaveBeenCalledOnce();
        }
    });

    it('announces an empty result without an impossible page number', () => {
        render(
            <DataTablePagination
                pageIndex={0}
                pageCount={0}
                canPreviousPage={false}
                canNextPage={false}
                onFirstPage={vi.fn()}
                onPreviousPage={vi.fn()}
                onNextPage={vi.fn()}
                onLastPage={vi.fn()}
            />,
        );

        expect(screen.getByText('Tidak ada halaman')).toBeTruthy();
        expect(screen.queryByText('Halaman 1 dari 0')).toBeNull();
    });

    it('renders result range and optional page-size controls', () => {
        const onPageSizeChange = vi.fn();
        render(
            <DataTablePagination
                pageIndex={1}
                pageCount={3}
                canPreviousPage
                canNextPage
                onFirstPage={vi.fn()}
                onPreviousPage={vi.fn()}
                onNextPage={vi.fn()}
                onLastPage={vi.fn()}
                rangeStart={26}
                rangeEnd={50}
                totalCount={63}
                pageSize={25}
                onPageSizeChange={onPageSizeChange}
            />,
        );

        expect(screen.getByRole('status').textContent).toBe(
            'Menampilkan 26–50 dari 63',
        );
        fireEvent.click(
            screen.getByRole('combobox', { name: 'Jumlah baris per halaman' }),
        );
        fireEvent.click(screen.getByRole('option', { name: '100' }));
        expect(onPageSizeChange).toHaveBeenCalledWith(100);
    });

    it('announces a zero-result range without an impossible one-based start', () => {
        render(
            <DataTablePagination
                pageIndex={0}
                pageCount={0}
                canPreviousPage={false}
                canNextPage={false}
                onFirstPage={vi.fn()}
                onPreviousPage={vi.fn()}
                onNextPage={vi.fn()}
                onLastPage={vi.fn()}
                rangeStart={0}
                rangeEnd={0}
                totalCount={0}
            />,
        );
        expect(screen.getByRole('status').textContent).toBe(
            'Menampilkan 0–0 dari 0',
        );
    });

    it('disables controls that cannot navigate and shows selection context', () => {
        render(
            <DataTablePagination
                pageIndex={0}
                pageCount={1}
                canPreviousPage={false}
                canNextPage={false}
                onFirstPage={vi.fn()}
                onPreviousPage={vi.fn()}
                onNextPage={vi.fn()}
                onLastPage={vi.fn()}
                selectedRowCount={2}
                totalRowCount={5}
            />,
        );

        expect(screen.getByText('2 dari 5 baris dipilih')).toBeTruthy();
        for (const name of [
            'Halaman pertama',
            'Halaman sebelumnya',
            'Halaman berikutnya',
            'Halaman terakhir',
        ]) {
            expect(
                (screen.getByRole('button', { name }) as HTMLButtonElement)
                    .disabled,
            ).toBe(true);
        }
    });
});
