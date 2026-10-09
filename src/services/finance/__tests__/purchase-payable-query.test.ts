import { describe, expect, it } from 'vitest';
import { buildOverduePurchaseInvoiceWhere } from '../purchase-payable-query';

const paidAmountField = Symbol('paidAmount');
const client = {
    purchaseInvoice: { fields: { paidAmount: paidAmountField } },
};

describe('buildOverduePurchaseInvoiceWhere', () => {
    it('uses the outstanding status allowlist, positive remaining, and WIB day cutoff', () => {
        const where = buildOverduePurchaseInvoiceWhere(
            client,
            new Date('2026-10-09T03:00:00.000Z'),
        );

        expect(where).toEqual({
            status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
            dueDate: { lt: new Date('2026-10-08T17:00:00.000Z') },
            totalAmount: { gt: paidAmountField },
        });
    });
});
