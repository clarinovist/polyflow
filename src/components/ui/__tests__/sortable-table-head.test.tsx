// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SortableTableHead } from '../sortable-table-head';

describe('SortableTableHead', () => {
    it('renders a keyboard-operable sort button and maps every sort state', () => {
        const onToggle = vi.fn();
        const { rerender } = render(
            <table>
                <thead>
                    <tr>
                        <SortableTableHead
                            sortable
                            direction={false}
                            onSort={onToggle}
                        >
                            Nama
                        </SortableTableHead>
                    </tr>
                </thead>
            </table>,
        );

        const header = screen.getByRole('columnheader', { name: 'Nama' });
        const button = screen.getByRole('button', {
            name: 'Urutkan berdasarkan Nama',
        });
        expect(header.getAttribute('aria-sort')).toBe('none');
        expect(button.getAttribute('type')).toBe('button');

        fireEvent.click(button);
        expect(onToggle).toHaveBeenCalledOnce();

        rerender(
            <table>
                <thead>
                    <tr>
                        <SortableTableHead
                            sortable
                            direction="asc"
                            onSort={onToggle}
                        >
                            Nama
                        </SortableTableHead>
                    </tr>
                </thead>
            </table>,
        );
        expect(header.getAttribute('aria-sort')).toBe('ascending');

        rerender(
            <table>
                <thead>
                    <tr>
                        <SortableTableHead
                            sortable
                            direction="desc"
                            onSort={onToggle}
                        >
                            Nama
                        </SortableTableHead>
                    </tr>
                </thead>
            </table>,
        );
        expect(header.getAttribute('aria-sort')).toBe('descending');
    });

    it('keeps block header content visible and aligned outside the sort button', () => {
        render(
            <table>
                <thead>
                    <tr>
                        <SortableTableHead
                            sortable
                            direction={false}
                            onSort={vi.fn()}
                        >
                            <div className="text-right">Total</div>
                        </SortableTableHead>
                    </tr>
                </thead>
            </table>,
        );

        const content = screen.getByText('Total');
        const button = screen.getByRole('button', {
            name: 'Urutkan berdasarkan Total',
        });

        expect(button.contains(content)).toBe(false);
        expect(content.classList.contains('text-right')).toBe(true);
        expect(content.parentElement?.classList.contains('flex-1')).toBe(true);
    });

    it('renders a plain header without sort semantics when sorting is disabled', () => {
        render(
            <table>
                <thead>
                    <tr>
                        <SortableTableHead direction={false}>
                            Aksi
                        </SortableTableHead>
                    </tr>
                </thead>
            </table>,
        );

        expect(
            screen.getByRole('columnheader', { name: 'Aksi' }).hasAttribute(
                'aria-sort',
            ),
        ).toBe(false);
        expect(screen.queryByRole('button')).toBeNull();
    });
});
