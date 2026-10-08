// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';

import { DataTable } from '../data-table';

interface ExampleRow {
    id: string;
    name: string;
}

const columns: ColumnDef<ExampleRow>[] = [
    {
        accessorKey: 'name',
        header: 'Nama',
    },
];

const data: ExampleRow[] = [
    { id: '1', name: 'Charlie' },
    { id: '2', name: 'Alpha' },
    { id: '3', name: 'Bravo' },
];

function renderCards(rows: ExampleRow[]) {
    return (
        <ul aria-label="Kartu data">
            {rows.map((row) => (
                <li key={row.id}>{row.name}</li>
            ))}
        </ul>
    );
}

describe('DataTable accessibility foundations', () => {
    it('keeps all rows visible by default and does not render pagination', () => {
        render(
            <DataTable
                columns={columns}
                data={data}
                renderMobileView={renderCards}
            />,
        );

        const table = screen.getByRole('table');
        const cards = screen.getByRole('list', { name: 'Kartu data' });

        for (const row of data) {
            expect(within(table).getByText(row.name)).toBeTruthy();
            expect(within(cards).getByText(row.name)).toBeTruthy();
        }
        expect(
            screen.queryByRole('navigation', { name: 'Paginasi tabel' }),
        ).toBeNull();
    });

    it('renders only the active page in desktop and mobile views when opted in', () => {
        render(
            <DataTable
                columns={columns}
                data={data}
                enablePagination
                pageSize={2}
                renderMobileView={renderCards}
            />,
        );

        const table = screen.getByRole('table');
        const cards = screen.getByRole('list', { name: 'Kartu data' });

        expect(within(table).getByText('Charlie')).toBeTruthy();
        expect(within(table).getByText('Alpha')).toBeTruthy();
        expect(within(table).queryByText('Bravo')).toBeNull();
        expect(within(cards).getByText('Charlie')).toBeTruthy();
        expect(within(cards).getByText('Alpha')).toBeTruthy();
        expect(within(cards).queryByText('Bravo')).toBeNull();

        fireEvent.click(
            screen.getByRole('button', { name: 'Halaman berikutnya' }),
        );

        expect(within(table).queryByText('Charlie')).toBeNull();
        expect(within(table).getByText('Bravo')).toBeTruthy();
        expect(within(cards).queryByText('Charlie')).toBeNull();
        expect(within(cards).getByText('Bravo')).toBeTruthy();
    });

    it('supports opt-in server pagination without slicing the supplied page', () => {
        const onPageChange = vi.fn();
        const onPageSizeChange = vi.fn();
        render(
            <DataTable
                columns={columns}
                data={data.slice(0, 2)}
                renderMobileView={renderCards}
                serverPagination={{
                    pageIndex: 1,
                    pageCount: 3,
                    totalCount: 7,
                    pageSize: 2,
                    onPageChange,
                    onPageSizeChange,
                    pageSizeOptions: [2, 4],
                }}
            />,
        );

        expect(screen.getByRole('status').textContent).toContain(
            'Menampilkan 3–4 dari 7',
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Halaman berikutnya' }),
        );
        expect(onPageChange).toHaveBeenCalledWith(2);
        expect(screen.getByRole('table').textContent).toContain('Charlie');
        expect(screen.getByRole('list').textContent).toContain('Alpha');
    });

    it('keeps server-supplied row order when manual sorting is enabled', () => {
        const onSortingChange = vi.fn();
        render(
            <DataTable
                columns={columns}
                data={data}
                manualSorting
                sorting={[{ id: 'name', desc: false }]}
                onSortingChange={onSortingChange}
            />,
        );
        const bodyText = screen.getByRole('table').textContent ?? '';
        expect(bodyText.indexOf('Charlie')).toBeLessThan(
            bodyText.indexOf('Alpha'),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Urutkan berdasarkan Nama' }),
        );
        expect(onSortingChange).toHaveBeenCalledWith([
            { id: 'name', desc: true },
        ]);
    });

    it('uses a button for sorting and exposes sort state on the column header', () => {
        render(<DataTable columns={columns} data={data} />);

        const header = screen.getByRole('columnheader', { name: 'Nama' });
        const sortButton = screen.getByRole('button', {
            name: 'Urutkan berdasarkan Nama',
        });

        expect(header.getAttribute('aria-sort')).toBe('none');
        expect(sortButton.getAttribute('type')).toBe('button');

        fireEvent.click(sortButton);
        expect(header.getAttribute('aria-sort')).toBe('ascending');

        fireEvent.click(sortButton);
        expect(header.getAttribute('aria-sort')).toBe('descending');
    });

    it('uses an optional caption as the table accessible name', () => {
        render(
            <DataTable
                columns={columns}
                data={data}
                caption="Daftar contoh"
            />,
        );

        expect(
            screen.getByRole('table', { name: 'Daftar contoh' }),
        ).toBeTruthy();
    });
});
