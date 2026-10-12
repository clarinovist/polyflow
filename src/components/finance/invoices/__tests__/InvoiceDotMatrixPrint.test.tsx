// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InvoiceDotMatrixPrint } from '../InvoiceDotMatrixPrint';
import { snapshotFixture } from '@/lib/finance/__tests__/invoice-snapshot-fixture';
import { getCompanyConfig } from '@/lib/config/company';

const invoice = {
    invoiceNumber: 'INV-TEST', invoiceDate: new Date('2026-09-14'), dueDate: null,
    status: 'UNPAID' as const, totalAmount: 16642500, roundingAmount: 180, paidAmount: 16642399.75,
    commercialSnapshot: snapshotFixture({ items: [{ ...snapshotFixture().items[0], quantity: 1, unitPrice: '16642320.00', netAmount: '14993081.08', taxAmount: '1649238.92', totalAmount: '16642320.00' }], shippingAmount: '0.00', taxAmount: '1649238.92', commercialTotal: '16642320.00' }),
    salesOrder: { orderNumber: 'SO-TEST', taxAmount: 1649238.92, items: [
        { quantity: 1, unitPrice: 16642320, subtotal: 16642320, productVariant: { name: 'Test item' } },
    ] },
};
const company = { ...getCompanyConfig(), name: 'Example Company', address: 'Example address',
    phone: '', whatsapp: '', email: '', signerName: 'Finance', bankAccountsPPN: [], bankAccountsNonPPN: [] };

describe('InvoiceDotMatrixPrint persisted totals', () => {
    it('deducts posted return credit without changing gross or tax', () => {
        render(<InvoiceDotMatrixPrint invoice={{ ...invoice, creditedAmount: 50 }} showButton={false} companyConfig={company} />);
        expect(screen.getByText('SISA TAGIHAN :').parentElement?.textContent).toContain('50,25');
        expect(screen.getByText('PPN :').parentElement?.textContent).toContain('1.649.238,92');
    });
    it('shows historical snapshot instead of mutable SO and warns for legacy', () => {
        const { unmount } = render(<InvoiceDotMatrixPrint invoice={invoice} showButton={false} companyConfig={company} />);
        expect(screen.getByText('Original A')).toBeTruthy();
        expect(document.querySelector('tfoot .col-qty')?.textContent).toBe('8');
        expect(document.querySelector('tbody .col-disc')?.textContent).toBe('0%');
        expect(screen.queryByText('Test item')).toBeNull();
        unmount();
        render(<InvoiceDotMatrixPrint invoice={{ ...invoice, commercialSnapshot: null }} showButton={false} companyConfig={company} />);
        expect(screen.getByRole('alert').textContent).toContain('tanpa snapshot');
        expect(screen.queryByText('Test item')).toBeNull();
    });
    it('formats decimal quantities and suppresses mixed-unit totals', () => {
        const baseItem = snapshotFixture().items[0];
        const decimalSnapshot = snapshotFixture({
            items: [
                {
                    ...baseItem,
                    sourceItemId: 'decimal-a',
                    quantity: 50.8,
                    enteredQuantity: 50.8,
                    enteredUnit: 'KG',
                    netAmount: '800.00',
                    taxAmount: '80.00',
                    totalAmount: '880.00',
                },
                {
                    ...baseItem,
                    sourceItemId: 'decimal-b',
                    quantity: 16.0508,
                    enteredQuantity: 16.0508,
                    enteredUnit: 'KG',
                    netAmount: '800.00',
                    taxAmount: '80.00',
                    totalAmount: '880.00',
                },
            ],
            taxAmount: '160.00',
            commercialTotal: '1780.00',
        });
        const { unmount } = render(
            <InvoiceDotMatrixPrint
                invoice={{ ...invoice, commercialSnapshot: decimalSnapshot }}
                showButton={false}
                companyConfig={company}
            />,
        );
        expect(document.querySelector('tfoot .col-qty')?.textContent).toBe(
            '66,8508',
        );
        unmount();

        const mixedSnapshot = snapshotFixture({
            items: [
                baseItem,
                {
                    ...baseItem,
                    sourceItemId: 'mixed-unit',
                    enteredUnit: 'PCS',
                    netAmount: '800.00',
                    taxAmount: '80.00',
                    totalAmount: '880.00',
                },
            ],
            taxAmount: '160.00',
            commercialTotal: '1780.00',
        });
        render(
            <InvoiceDotMatrixPrint
                invoice={{ ...invoice, commercialSnapshot: mixedSnapshot }}
                showButton={false}
                companyConfig={company}
            />,
        );
        expect(document.querySelector('tfoot .col-qty')?.textContent).toBe('—');
    });

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
