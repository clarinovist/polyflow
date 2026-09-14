// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InvoiceDotMatrixPrint } from '../InvoiceDotMatrixPrint';
import { getCompanyConfig } from '@/lib/config/company';

const invoice = {
    invoiceNumber: 'INV-TEST', invoiceDate: new Date('2026-09-14'), dueDate: null,
    status: 'UNPAID' as const, totalAmount: 16642500, roundingAmount: 180, paidAmount: 16642399.75,
    salesOrder: { orderNumber: 'SO-TEST', taxAmount: 1649238.92, items: [
        { quantity: 1, unitPrice: 16642320, subtotal: 16642320, productVariant: { name: 'Test item' } },
    ] },
};
const company = { ...getCompanyConfig(), name: 'Example Company', address: 'Example address',
    phone: '', whatsapp: '', email: '', signerName: 'Finance', bankAccountsPPN: [], bankAccountsNonPPN: [] };

describe('InvoiceDotMatrixPrint persisted totals', () => {
    it('prints rounded total without adjustment row, unchanged VAT and exact remaining', () => {
        render(<InvoiceDotMatrixPrint invoice={invoice} showButton={false} companyConfig={company} />);
        expect(screen.queryByText('PEMBULATAN :')).toBeNull();
        expect(screen.getAllByText('TOTAL :').find(el => el.parentElement?.classList.contains('summary-row'))?.parentElement?.textContent).toContain('16.642.500,00');
        expect(screen.getByText('PPN :').parentElement?.textContent).toContain('1.649.238,92');
        expect(screen.getByText('DPP :').parentElement?.textContent).toContain('14.993.081,08');
        expect(screen.getByText('SISA TAGIHAN :').parentElement?.textContent).toContain('100,25');
    });
    it.each([null, 0])('omits rounding for legacy/zero %s', roundingAmount => {
        const legacy = { ...invoice, roundingAmount, totalAmount: 16642320 };
        render(<InvoiceDotMatrixPrint invoice={legacy} showButton={false} companyConfig={company} />);
        expect(screen.queryByText('PEMBULATAN :')).toBeNull();
        expect(screen.getAllByText('TOTAL :').find(el => el.parentElement?.classList.contains('summary-row'))?.parentElement?.textContent).toContain('16.642.320,00');
    });
});
