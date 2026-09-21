// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { PurchaseInvoiceStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
    usePathname: () => '/finance/invoices/purchase',
    useRouter: () => ({ push }),
}));
vi.mock('@/actions/finance/invoices', () => ({
    deleteInvoice: vi.fn(),
}));

import { PurchaseInvoiceTable } from '../PurchaseInvoiceTable';

const invoices = [
    {
        id: 'inv-51',
        invoiceNumber: 'BILL-0051',
        invoiceDate: '2026-09-12T00:00:00.000Z',
        dueDate: '2026-10-12T00:00:00.000Z',
        status: PurchaseInvoiceStatus.UNPAID,
        totalAmount: 250000,
        paidAmount: 0,
        purchaseOrderId: 'po-51',
        purchaseOrder: {
            id: 'po-51',
            orderNumber: 'PO-0051',
            supplier: { name: 'Supplier Finance' },
        },
    },
];

const pagination = {
    page: 2,
    pageSize: 50,
    totalCount: 75,
    totalPages: 2,
};

describe('PurchaseInvoiceTable shared paged contract', () => {
    beforeEach(() => {
        push.mockReset();
        window.history.replaceState(
            {},
            '',
            '/finance/invoices/purchase?page=2&pageSize=50&status=UNPAID&startDate=2026-09-01&endDate=2026-09-12',
        );
    });

    it('renders the current page with preserved finance detail links and table semantics', () => {
        render(
            <PurchaseInvoiceTable
                invoices={invoices}
                pagination={pagination}
                basePath="/finance/invoices/purchase"
                initialStatus="UNPAID"
                sort="invoiceDate"
                direction="desc"
            />,
        );

        const table = screen.getByRole('table', {
            name: 'Daftar invoice pembelian',
        });
        expect(within(table).getByText('BILL-0051')).toBeTruthy();
        expect(
            within(table)
                .getByRole('link', { name: 'BILL-0051' })
                .getAttribute('href'),
        ).toBe('/finance/invoices/purchase/inv-51');
        expect(screen.getByText('Menampilkan 1 dari 75 invoice')).toBeTruthy();
        expect(
            screen.getByRole('navigation', {
                name: 'Paginasi invoice pembelian',
            }),
        ).toBeTruthy();
        expect(
            screen.getByRole('columnheader', { name: 'No. Invoice' })
                .getAttribute('aria-sort'),
        ).toBe('descending');
        expect(
            within(table).getByRole('button', {
                name: 'Urutkan berdasarkan No. Invoice',
            }),
        ).toBeTruthy();
        expect(table.closest('[data-sticky-table="true"]')).toBeTruthy();
    });

    it('renders mobile invoice details, identical finance/purchasing links and delete confirmation', () => {
        const { rerender } = render(<PurchaseInvoiceTable invoices={invoices} basePath="/finance/invoices/purchase" />);
        const card = within(screen.getByRole('article', { name: 'Invoice BILL-0051' }));
        expect(card.getByText('Supplier Finance')).toBeTruthy();
        expect(card.getByRole('link', { name: 'BILL-0051' }).getAttribute('href')).toBe('/finance/invoices/purchase/inv-51');
        fireEvent.click(card.getByRole('button', { name: 'Hapus/Batal BILL-0051' }));
        expect(screen.getByRole('alertdialog')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
        rerender(<PurchaseInvoiceTable invoices={invoices} />);
        expect(within(screen.getByRole('article')).getByRole('link', { name: 'BILL-0051' }).getAttribute('href')).toBe('/purchasing/orders/po-51');
    });

    it('preserves date filters while updating URL-backed pagination, filters, and sorting', () => {
        render(
            <PurchaseInvoiceTable
                invoices={invoices}
                pagination={pagination}
                basePath="/finance/invoices/purchase"
                initialStatus="UNPAID"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Halaman sebelumnya' }));
        expect(push).toHaveBeenLastCalledWith(
            '/finance/invoices/purchase?page=1&pageSize=50&status=UNPAID&startDate=2026-09-01&endDate=2026-09-12',
        );

        fireEvent.change(screen.getByLabelText('Cari invoice pembelian'), {
            target: { value: 'Supplier Finance' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Terapkan filter' }));
        expect(push).toHaveBeenLastCalledWith(
            '/finance/invoices/purchase?page=1&pageSize=50&status=UNPAID&startDate=2026-09-01&endDate=2026-09-12&search=Supplier+Finance',
        );

        fireEvent.click(
            screen.getByRole('button', {
                name: 'Urutkan berdasarkan No. Invoice',
            }),
        );
        expect(push).toHaveBeenLastCalledWith(
            '/finance/invoices/purchase?page=1&pageSize=50&status=UNPAID&startDate=2026-09-01&endDate=2026-09-12&sort=invoiceDate&direction=asc',
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Urutkan berdasarkan Total' }),
        );
        expect(push).toHaveBeenLastCalledWith(
            '/finance/invoices/purchase?page=1&pageSize=50&status=UNPAID&startDate=2026-09-01&endDate=2026-09-12&sort=totalAmount&direction=desc',
        );
    });
});
