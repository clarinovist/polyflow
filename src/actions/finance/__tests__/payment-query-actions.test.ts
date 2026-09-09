import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { db, access } = vi.hoisted(() => ({ db: { payment: { findMany: vi.fn() }, barterSettlement: { findMany: vi.fn() } }, access: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ prisma: db }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/auth/finance-access', () => ({ requireFinanceAccess: access }));
import { getReceivedPayments, getSentPayments } from '../payment-query-actions';
const date = new Date('2026-09-09');
const ordinary = { id: 'p', paymentNumber: 'PAY-1', paymentDate: date, amount: new Prisma.Decimal(100), method: 'Cash', barterLeg: null,
    invoice: { salesOrder: { orderNumber: 'SO-1', customer: { name: 'Customer' } } }, purchaseInvoice: { purchaseOrder: { supplier: { name: 'Supplier' } } } };
const snapshot = { id: 's', settlementNumber: 'BRT-1', barterDate: new Date('2026-09-01'), cashPaymentDate: new Date('2026-09-12'), barterAmount: new Prisma.Decimal(600), cashAmount: new Prisma.Decimal(400),
    arPaymentNumber: 'AR-1', apOffsetPaymentNumber: 'AP-1', apCashPaymentNumber: 'CASH-1', cashMethod: 'Cash', cashReferenceNumber: 'REF', customer: { name: 'Customer' }, supplier: { name: 'Supplier' } };
describe('payment-query-actions', () => {
    beforeEach(() => { vi.resetAllMocks(); access.mockResolvedValue({}); db.payment.findMany.mockResolvedValue([]); db.barterSettlement.findMany.mockResolvedValue([]); });
    it('authenticates before querying and propagates denial', async () => {
        access.mockRejectedValue(new Error('Denied'));
        expect((await getReceivedPayments()).success).toBe(false); expect((await getSentPayments()).success).toBe(false);
        expect(db.payment.findMany).not.toHaveBeenCalled();
    });
    it('merges ordinary and posted/voided barter in date order, keeps cash/noncash identity', async () => {
        db.payment.findMany.mockResolvedValue([ordinary, { ...ordinary, id: 'barter-leg', barterLeg: 'AR_OFFSET', method: 'Barter', barterSettlement: { id: 'posted', settlementNumber: 'BRT-2', status: 'POSTED' } }]);
        db.barterSettlement.findMany.mockResolvedValue([snapshot]);
        const result = await getReceivedPayments(undefined, 'customer');
        expect(result.success).toBe(true); if (!result.success) return;
        expect(result.data).toHaveLength(3);
        expect(result.data[2]).toMatchObject({ status: 'VOIDED', amount: 600, settlementId: 's', barterLeg: 'AR_OFFSET' });
        expect(result.data.find(p => p.id === 'barter-leg')).toMatchObject({ referenceNumber: 'BRT-2', paymentNumber: 'PAY-1' });
        expect(db.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200, where: expect.objectContaining({ invoice: { salesOrder: { customerId: { not: null } } } }) }));
    });
    it('legacy history never fetches external barter snapshots', async () => {
        db.payment.findMany.mockResolvedValue([{ ...ordinary, invoice: { salesOrder: { orderNumber: 'SO-OLD', customer: null } } }]);
        const result = await getReceivedPayments(undefined, 'legacy-internal');
        expect(db.barterSettlement.findMany).not.toHaveBeenCalled();
        expect(result.success && result.data[0].entityName).toContain('SO-OLD');
    });
    it('queries voided cash by its actual date, not the offset date; returns only that stream', async () => {
        db.barterSettlement.findMany.mockImplementation(async args => args.where.cashAmount ? [snapshot] : []);
        const range = { startDate: new Date('2026-09-10'), endDate: new Date('2026-09-15') };
        const result = await getSentPayments(range);
        expect(result.success && result.data).toEqual([expect.objectContaining({ barterLeg: 'AP_CASH', amount: 400, date: snapshot.cashPaymentDate.toISOString(), status: 'VOIDED' })]);
        expect(db.barterSettlement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'VOIDED', cashAmount: { gt: 0 }, cashPaymentDate: { gte: range.startDate, lte: range.endDate } }, take: 200 }));
    });
    it('offset-only date stream and active supplier payment are both retained and bounded', async () => {
        db.payment.findMany.mockResolvedValue([ordinary]); db.barterSettlement.findMany.mockResolvedValueOnce([snapshot]);
        const result = await getSentPayments();
        expect(result.success && result.data.map(p => p.barterLeg)).toEqual([null, 'AP_OFFSET']);
        db.payment.findMany.mockResolvedValue(Array.from({ length: 200 }, (_, i) => ({ ...ordinary, id: `p-${i}` })));
        db.barterSettlement.findMany.mockResolvedValue([snapshot]);
        const capped = await getSentPayments(); expect(capped.success && capped.data).toHaveLength(200);
    });
});
