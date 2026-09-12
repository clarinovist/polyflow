// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';

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
