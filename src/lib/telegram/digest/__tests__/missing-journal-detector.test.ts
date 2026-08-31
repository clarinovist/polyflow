import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

const { mockCollect } = vi.hoisted(() => ({
    mockCollect: vi.fn(),
}));

vi.mock('@/services/finance/journal-health-service', () => ({
    collectFinanceJournalIssues: mockCollect,
}));

import { detectMissingFinanceJournals } from '../detectors';

describe('detectMissingFinanceJournals', () => {
    const tenantDb = { raw: true } as unknown as PrismaClient;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('maps every issue type into items with correct severity and entity keys', async () => {
        mockCollect.mockResolvedValue({
            arAccountCode: '1-115b',
            apAccountCode: '2-110b',
            salesInvoicesMissing: [
                {
                    id: 'inv-1',
                    invoiceNumber: 'INV-049',
                    status: 'PAID',
                    invoiceDate: new Date(),
                    totalAmount: 23415000,
                    customerName: 'Toko Jantan',
                },
            ],
            salesInvoiceShortfalls: [
                {
                    id: 'inv-2',
                    invoiceNumber: 'INV-031',
                    arDebit: 127000,
                    totalAmount: 150000,
                    difference: 23000,
                },
            ],
            salesPaymentsMissing: [
                {
                    id: 'pay-1',
                    paymentNumber: null,
                    paymentDate: new Date(),
                    amount: 5000000,
                    method: 'Cash',
                },
            ],
            purchaseInvoicesMissing: [
                {
                    id: 'pinv-1',
                    invoiceNumber: 'BILL-1',
                    status: 'UNPAID',
                    invoiceDate: new Date(),
                    totalAmount: 110000,
                },
            ],
            purchasePaymentsMissing: [
                {
                    id: 'ppay-1',
                    paymentNumber: 'PAY-OUT-2',
                    paymentDate: new Date(),
                    amount: 700000,
                    method: 'Bank Transfer',
                },
            ],
        });

        const result = await detectMissingFinanceJournals(tenantDb);

        expect(result.detector).toBe('missing_finance_journal');
        expect(result.status).toBe('ok');
        expect(result.items).toHaveLength(5);

        const keys = result.items.map((i) => i.entityKey);
        expect(keys).toEqual([
            'missing_finance_journal:SALES_INVOICE:inv-1',
            'missing_finance_journal:SALES_INVOICE_SHORTFALL:inv-2',
            'missing_finance_journal:SALES_PAYMENT:pay-1',
            'missing_finance_journal:PURCHASE_INVOICE:pinv-1',
            'missing_finance_journal:PURCHASE_PAYMENT:ppay-1',
        ]);

        const severities = result.items.map((i) => i.severity);
        expect(severities).toEqual([
            'critical',
            'critical',
            'critical',
            'critical',
            'critical',
        ]);

        expect(result.items[0].headline).toContain('INV-049');
        expect(result.items[0].detail).toContain('Toko Jantan');
    });

    it('returns ok with no items when everything is journalled', async () => {
        mockCollect.mockResolvedValue({
            arAccountCode: '1-115b',
            apAccountCode: '2-110b',
            salesInvoicesMissing: [],
            salesInvoiceShortfalls: [],
            salesPaymentsMissing: [],
            purchaseInvoicesMissing: [],
            purchasePaymentsMissing: [],
        });

        const result = await detectMissingFinanceJournals(tenantDb);

        expect(result.status).toBe('ok');
        expect(result.items).toHaveLength(0);
    });

    it('reports failed status when collection throws', async () => {
        mockCollect.mockRejectedValue(new Error('db down'));

        const result = await detectMissingFinanceJournals(tenantDb);

        expect(result.status).toBe('failed');
        expect(result.error).toContain('db down');
        expect(result.items).toHaveLength(0);
    });
});
