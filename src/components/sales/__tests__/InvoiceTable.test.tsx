// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceStatus } from '@prisma/client';

const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace }),
    useSearchParams: () =>
        new URLSearchParams('demand=customer&page=1&pageSize=50'),
}));
vi.mock('@/actions/finance/invoices', () => ({ deleteInvoice: vi.fn() }));

import { InvoiceTable } from '../InvoiceTable';

const invoice = {
    id: 'invoice-1',
    invoiceNumber: 'INV-001',
    invoiceDate: '2026-09-01T00:00:00.000Z',
    dueDate: '2026-09-30T00:00:00.000Z',
    totalAmount: 100_000,
    paidAmount: 0,
    status: InvoiceStatus.UNPAID,
    salesOrderId: 'order-1',
    salesOrder: {
        orderNumber: 'SO-001',
        customer: { name: 'Customer Satu' },
    },
};

describe('InvoiceTable finance server pagination', () => {
    it('renders accessible server-sort headers and preserves URL state when sorting', () => {
        render(
            <InvoiceTable
                invoices={[invoice]}
                basePath="/finance/invoices/sales"
                pagination={{
                    page: 2,
                    pageSize: 50,
                    total: 120,
                    totalPages: 3,
                }}
                serverSorting={{ sort: 'invoiceDate', direction: 'desc' }}
            />,
        );

        const invoiceHeader = screen.getByRole('columnheader', {
            name: /No\. Invoice/,
        });
        expect(invoiceHeader.getAttribute('aria-sort')).toBe('descending');

        const entitySort = screen.getByRole('button', {
            name: 'Urutkan berdasarkan Entitas',
        });
        entitySort.focus();
        fireEvent.keyDown(entitySort, { key: 'Enter', code: 'Enter' });
        fireEvent.click(entitySort);

        expect(push).toHaveBeenCalledWith(
            expect.stringContaining('demand=customer'),
        );
        expect(push).toHaveBeenCalledWith(
            expect.stringContaining('pageSize=50'),
        );
        expect(push).toHaveBeenCalledWith(expect.stringContaining('page=1'));
        expect(push).toHaveBeenCalledWith(
            expect.stringContaining('sort=entity'),
        );
        expect(push).toHaveBeenCalledWith(
            expect.stringContaining('direction=asc'),
        );
    });

    it('renders accessible bounded-table context and URL pagination', () => {
        render(
            <InvoiceTable
                invoices={[invoice]}
                basePath="/finance/invoices/sales"
                pagination={{
                    page: 1,
                    pageSize: 50,
                    total: 120,
                    totalPages: 3,
                }}
            />,
        );

        expect(
            screen.getByRole('table', { name: 'Daftar invoice sales' }),
        ).toBeTruthy();
        expect(screen.getByText('Menampilkan 1–50 dari 120 invoice')).toBeTruthy();
        expect(
            screen.getByRole('navigation', { name: 'Paginasi invoice sales' }),
        ).toBeTruthy();
        expect(
            screen.getByRole('button', {
                name: /Urutkan berdasarkan No\./,
            }),
        ).toBeTruthy();

        fireEvent.click(
            screen.getByRole('button', { name: 'Halaman berikutnya' }),
        );
        expect(push).toHaveBeenCalledWith(
            expect.stringContaining('page=2'),
        );
        expect(push).toHaveBeenCalledWith(
            expect.stringContaining('pageSize=50'),
        );
    });

    it('keeps full-list Sales callers free of server pagination controls', () => {
        render(<InvoiceTable invoices={[invoice]} />);

        expect(
            screen.queryByRole('navigation', {
                name: 'Paginasi invoice sales',
            }),
        ).toBeNull();
        expect(screen.getAllByText('INV-001').length).toBeGreaterThan(0);
        expect(
            screen.getByRole('button', {
                name: /Urutkan berdasarkan No\./,
            }),
        ).toBeTruthy();
    });
});
