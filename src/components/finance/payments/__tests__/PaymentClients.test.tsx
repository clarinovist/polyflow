// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/finance/SharedPaymentTable', () => ({ SharedPaymentTable: ({ type }: { type: string }) => <p>Transactions {type}</p> }));
vi.mock('@/components/common/url-transaction-date-filter', () => ({ UrlTransactionDateFilter: ({ defaultPreset }: { defaultPreset: string }) => <button>{defaultPreset}</button> }));
vi.mock('@/components/finance/payments/RecordCustomerPaymentDialog', () => ({ RecordCustomerPaymentDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">Customer payment</div> : null }));
vi.mock('@/components/finance/payments/RecordSupplierPaymentDialog', () => ({ RecordSupplierPaymentDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">Supplier payment</div> : null }));
vi.mock('@/components/finance/payments/RemittanceVerificationQueue', () => ({ RemittanceVerificationQueue: () => <p>Customer verification</p> }));
vi.mock('@/components/finance/payments/PurchaseRemittanceVerificationQueue', () => ({ PurchaseRemittanceVerificationQueue: () => <p>Supplier verification</p> }));

import { ReceivedPaymentsClient } from '../ReceivedPaymentsClient';
import { SentPaymentsClient } from '../SentPaymentsClient';
const invoice = { id: 'synthetic-invoice', invoiceNumber: 'INV-TEST', totalAmount: 1000, paidAmount: 0, salesOrder: { orderNumber: 'SO-TEST', customer: { name: 'Synthetic customer' } } };

describe('responsive payment clients', () => {
    it.each(['received', 'sent'] as const)('keeps %s transactions, verification tabs, date defaults and record action', (type) => {
        render(type === 'received'
            ? <ReceivedPaymentsClient payments={[]} unpaidInvoices={[invoice]} demandType="customer" />
            : <SentPaymentsClient payments={[]} unpaidInvoices={[invoice]} />);
        expect(screen.getByText(`Transactions ${type}`)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'this_month' })).toBeTruthy();
        const tab = screen.getByRole('tab', { name: 'Setoran Menunggu Verifikasi' });
        expect(tab.className).toContain('whitespace-normal');
        fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
        expect(screen.getByText(type === 'received' ? 'Customer verification' : 'Supplier verification')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Catat Pembayaran' }));
        expect(screen.getByRole('dialog').textContent).toBe(type === 'received' ? 'Customer payment' : 'Supplier payment');
    });
    it('does not enable recording customer payments when no eligible invoice exists', () => {
        render(<ReceivedPaymentsClient payments={[]} unpaidInvoices={[]} demandType="legacy-internal" />);
        expect(screen.queryByRole('button', { name: 'Catat Pembayaran' })).toBeNull();
        expect(screen.getByText(/penerimaan internal lama/)).toBeTruthy();
    });
});
