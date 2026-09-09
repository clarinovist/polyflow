import { ReferenceType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { db } = vi.hoisted(() => ({ db: { payment: { findMany: vi.fn() }, invoice: { findMany: vi.fn() }, purchaseInvoice: { findMany: vi.fn() }, barterSettlement: { findMany: vi.fn() } } }));
vi.mock('@/lib/core/prisma', () => ({ prisma: db }));
import { sourceDocKey, resolveSourceDocNumbers } from '../journal-source-document';
describe('journal-source-document', () => {
    beforeEach(() => { for (const table of Object.values(db)) table.findMany.mockReset().mockResolvedValue([]); });
    it('ignores nullable/unsupported references and avoids empty queries', async () => {
        expect(sourceDocKey({ referenceType: null, referenceId: 'x' })).toBeNull();
        expect(sourceDocKey({ referenceType: 'SALES_PAYMENT', referenceId: null })).toBeNull();
        expect(await resolveSourceDocNumbers([{ referenceType: 'MANUAL_ENTRY', referenceId: 'x' }, { referenceType: null, referenceId: null }])).toEqual(new Map());
        for (const table of Object.values(db)) expect(table.findMany).not.toHaveBeenCalled();
    });
    it('batches/deduplicates ordinary sources and uses PO or bill fallback', async () => {
        db.payment.findMany.mockResolvedValue([{ id: 'p', invoice: { invoiceNumber: 'INV-1' }, purchaseInvoice: null }, { id: 'q', purchaseInvoice: { invoiceNumber: 'BILL-1', purchaseOrder: { orderNumber: 'PO-1' } } }, { id: 'r', purchaseInvoice: { invoiceNumber: 'BILL-2' } }]);
        db.invoice.findMany.mockResolvedValue([{ id: 's', invoiceNumber: 'INV-2' }]);
        db.purchaseInvoice.findMany.mockResolvedValue([{ id: 'a', invoiceNumber: 'BILL-A', purchaseOrder: { orderNumber: 'PO-A' } }, { id: 'b', invoiceNumber: 'BILL-B' }]);
        const refs = [['SALES_PAYMENT', 'p'], ['SALES_PAYMENT', 'p'], ['PURCHASE_PAYMENT', 'q'], ['PURCHASE_PAYMENT', 'r'], ['SALES_INVOICE', 's'], ['PURCHASE_INVOICE', 'a'], ['PURCHASE_INVOICE', 'b']] as const;
        const result = await resolveSourceDocNumbers(refs.map(([referenceType, referenceId]) => ({ referenceType, referenceId })));
        expect([...result.values()]).toEqual(['INV-1', 'PO-1', 'BILL-2', 'PO-A', 'BILL-B', 'INV-2']);
        expect(db.payment.findMany).toHaveBeenCalledOnce();
        expect(db.payment.findMany.mock.calls[0][0].where.id.in).toEqual(['p', 'q', 'r']);
    });
    it('resolves BRT and historical cash payment after child deletion without filtering VOIDED', async () => {
        db.barterSettlement.findMany.mockResolvedValueOnce([{ id: 's', settlementNumber: 'BRT-1' }]).mockResolvedValueOnce([{ apCashPaymentId: 'gone', purchaseInvoice: { invoiceNumber: 'BILL', purchaseOrder: { orderNumber: 'PO' } } }]);
        const result = await resolveSourceDocNumbers([{ referenceType: ReferenceType.BARTER_SETTLEMENT, referenceId: 's' }, { referenceType: ReferenceType.PURCHASE_PAYMENT, referenceId: 'gone' }]);
        expect(result.get('BARTER_SETTLEMENT:s')).toBe('BRT-1'); expect(result.get('PURCHASE_PAYMENT:gone')).toBe('PO');
        expect(db.barterSettlement.findMany.mock.calls[1][0].where).toEqual({ apCashPaymentId: { in: ['gone'] } });
    });
    it('historical cash falls back to bill; unresolved references remain absent', async () => {
        db.barterSettlement.findMany.mockResolvedValue([{ apCashPaymentId: null }, { apCashPaymentId: 'gone', purchaseInvoice: { invoiceNumber: 'BILL' } }]);
        const result = await resolveSourceDocNumbers([{ referenceType: 'PURCHASE_PAYMENT', referenceId: 'gone' }]);
        expect(result.get('PURCHASE_PAYMENT:gone')).toBe('BILL'); expect(result.has('PURCHASE_PAYMENT:missing')).toBe(false);
    });
});
