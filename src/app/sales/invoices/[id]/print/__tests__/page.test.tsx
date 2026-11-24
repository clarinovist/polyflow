// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSalesInvoiceForPrint, getCompany, notFound } = vi.hoisted(() => ({
    getSalesInvoiceForPrint: vi.fn(),
    getCompany: vi.fn(),
    notFound: vi.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
    }),
}));

vi.mock('@/actions/finance/invoice-print', () => ({ getSalesInvoiceForPrint }));
vi.mock('@/lib/config/company-settings', () => ({
    getCompanyConfigWithOverridesAsync: getCompany,
}));
vi.mock('next/navigation', () => ({ notFound }));
vi.mock('@/components/finance/invoices/InvoiceDotMatrixPrint', () => ({
    InvoiceDotMatrixPrint: (props: {
        invoice: Record<string, unknown>;
        invoiceId?: string;
        companyConfig?: { name: string };
    }) => (
        <output data-testid="invoice-print">
            {JSON.stringify({
                invoiceId: props.invoiceId,
                company: props.companyConfig?.name,
                totalAmount: props.invoice.totalAmount,
                taxAmount: (props.invoice.salesOrder as { taxAmount: number })
                    ?.taxAmount,
            })}
        </output>
    ),
}));

import PrintPage from '../page';

const params = Promise.resolve({ id: 'invoice-1' });

describe('sales invoice print page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getCompany.mockResolvedValue({ name: 'PT Contoh' });
    });

    it('renders the invoice with numeric amounts for the print component', async () => {
        getSalesInvoiceForPrint.mockResolvedValue({
            success: true,
            data: {
                id: 'invoice-1',
                totalAmount: '1100.00',
                paidAmount: '0.00',
                salesOrder: { taxAmount: '100.00', items: [] },
            },
        });

        render(await PrintPage({ params }));

        expect(getSalesInvoiceForPrint).toHaveBeenCalledWith('invoice-1');
        expect(
            JSON.parse(screen.getByTestId('invoice-print').textContent ?? ''),
        ).toEqual({
            invoiceId: 'invoice-1',
            company: 'PT Contoh',
            totalAmount: 1100,
            taxAmount: 100,
        });
    });

    it('answers 404 when the invoice is not found or out of scope', async () => {
        getSalesInvoiceForPrint.mockResolvedValue({ success: true, data: null });

        await expect(PrintPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
        expect(notFound).toHaveBeenCalledTimes(1);
    });

    it('throws the action error instead of rendering a blank document', async () => {
        getSalesInvoiceForPrint.mockResolvedValue({
            success: false,
            error: 'Unauthorized: Akses baca finance tidak diizinkan untuk role ini.',
        });

        await expect(PrintPage({ params })).rejects.toThrow(
            'Unauthorized: Akses baca finance tidak diizinkan untuk role ini.',
        );
        expect(notFound).not.toHaveBeenCalled();
    });
});
