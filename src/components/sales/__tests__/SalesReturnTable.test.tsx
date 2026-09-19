// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { salesLabels } from '@/lib/labels';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { SalesReturnTable } from '../SalesReturnTable';

type ReturnRow = ComponentProps<typeof SalesReturnTable>['initialData'][number];
const statuses = ['DRAFT', 'CONFIRMED', 'RECEIVED', 'COMPLETED', 'CANCELLED'] as const;
const rows = statuses.map((status, index) => ({
    id: `return-${index}`,
    returnNumber: `SR-TEST-${index}`,
    returnDate: new Date('2026-09-19T00:00:00Z'),
    status,
    totalAmount: 100,
    customer: { name: 'Synthetic customer' },
    salesOrder: { orderNumber: 'SO-TEST' },
    _count: { items: 1 },
})) as ReturnRow[];

describe('SalesReturnTable detail navigation', () => {
    it('renders a native, keyboard-focusable desktop detail link for every status', () => {
        render(<SalesReturnTable initialData={rows} />);
        const table = within(screen.getByRole('table'));
        for (const row of rows) {
            const link = table.getByRole('link', { name: `Lihat Detail ${row.returnNumber}` });
            expect(link.getAttribute('href')).toBe(`/sales/returns/${row.id}`);
            expect(link.textContent).toContain(row.returnNumber);
            expect(link.tabIndex).toBe(0);
            link.focus();
            expect(document.activeElement).toBe(link);
        }
    });

    it('uses a native whole-card mobile link instead of a pointer-only div', () => {
        const { container } = render(<SalesReturnTable initialData={[rows[0]]} />);
        const mobile = container.querySelector('.md\\:hidden') as HTMLElement;
        const link = within(mobile).getByRole('link', { name: `Lihat Detail ${rows[0].returnNumber}` });
        expect(link.getAttribute('href')).toBe('/sales/returns/return-0');
        expect(link.textContent).toContain('Lihat Detail');
        expect(link.querySelector('[data-slot="card"]')).not.toBeNull();
        expect(link.tabIndex).toBe(0);
        link.focus();
        expect(document.activeElement).toBe(link);
    });

    it('keeps both layouts in the supplied portal after basePath changes', () => {
        const { rerender } = render(<SalesReturnTable initialData={[rows[0]]} />);
        rerender(<SalesReturnTable initialData={[rows[0]]} basePath="/alternate/returns" />);
        const links = screen.getAllByRole('link', { name: `Lihat Detail ${rows[0].returnNumber}` });
        expect(links).toHaveLength(2);
        for (const link of links) expect(link.getAttribute('href')).toBe('/alternate/returns/return-0');
    });

    it('preserves sorting and keeps the correct return identity on each link', () => {
        render(<SalesReturnTable initialData={rows} />);
        fireEvent.click(screen.getByRole('button', { name: /Status/ }));
        const table = within(screen.getByRole('table'));
        for (const row of rows) {
            expect(table.getByRole('link', { name: `Lihat Detail ${row.returnNumber}` }).getAttribute('href'))
                .toBe(`/sales/returns/${row.id}`);
        }
    });

    it('preserves empty states without manufacturing a detail link', () => {
        render(<SalesReturnTable initialData={[]} />);
        expect(screen.queryAllByRole('link')).toHaveLength(0);
        expect(screen.getAllByText(salesLabels.emptyReturns).length).toBeGreaterThan(0);
    });
});
