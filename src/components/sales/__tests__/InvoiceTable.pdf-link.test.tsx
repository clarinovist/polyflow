// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceStatus } from '@prisma/client';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams('demand=customer'),
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

const PDF_LINK_NAME = 'Cetak PDF invoice INV-001';

describe('InvoiceTable PDF print link', () => {
    it('links to the finance print route by default on desktop and mobile', () => {
        render(<InvoiceTable invoices={[invoice]} canPrint canDelete={false} />);

        const links = screen.getAllByRole('link', { name: PDF_LINK_NAME });

        expect(links).toHaveLength(2);
        for (const link of links) {
            expect(link.getAttribute('href')).toBe(
                '/finance/invoices/sales/invoice-1/print',
            );
            expect(link.textContent).toContain('Cetak PDF');
        }
    });

    it('uses the sales print route when pdfBasePath is /sales/invoices', () => {
        render(
            <InvoiceTable
                invoices={[invoice]}
                canPrint
                canDelete={false}
                pdfBasePath="/sales/invoices"
            />,
        );

        for (const link of screen.getAllByRole('link', {
            name: PDF_LINK_NAME,
        })) {
            expect(link.getAttribute('href')).toBe(
                '/sales/invoices/invoice-1/print',
            );
        }
    });

    it('opens the print view in a new tab without leaking the opener', () => {
        render(<InvoiceTable invoices={[invoice]} canPrint canDelete={false} />);

        const [link] = screen.getAllByRole('link', { name: PDF_LINK_NAME });

        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('keeps the ESC/P download next to the PDF link', () => {
        const { container } = render(
            <InvoiceTable invoices={[invoice]} canPrint canDelete={false} />,
        );
        const card = container.querySelector('[data-slot="card"]') as HTMLElement;

        expect(
            within(card).getByRole('link', { name: PDF_LINK_NAME }),
        ).toBeTruthy();
        expect(
            within(card).getByRole('link', {
                name: 'Cetak invoice INV-001 (ESC/P)',
            }),
        ).toBeTruthy();
    });

    it('hides the PDF link unless printing is enabled', () => {
        render(<InvoiceTable invoices={[invoice]} canDelete={false} />);

        expect(screen.queryByRole('link', { name: /Cetak PDF/ })).toBeNull();
    });

    it('does not offer the PDF link for purchase invoices', () => {
        render(
            <InvoiceTable
                canPrint
                invoices={[
                    {
                        ...invoice,
                        salesOrderId: null,
                        salesOrder: null,
                        purchaseOrderId: 'purchase-1',
                        purchaseOrder: {
                            orderNumber: 'PO-001',
                            supplier: { name: 'Supplier fixture' },
                        },
                    },
                ]}
            />,
        );

        expect(screen.queryByRole('link', { name: /Cetak PDF/ })).toBeNull();
    });
});
