import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { collectBarterHealth } from '../barter-health-service';
const d = (n: number) => new Prisma.Decimal(n);
const date = new Date('2026-09-09');
function fixture(cash = false) {
    const s = { id: 's', settlementNumber: 'BRT', barterAmount: d(600), cashAmount: d(cash ? 400 : 0), arPaymentId: 'ar', apOffsetPaymentId: 'ap', apCashPaymentId: 'cash', invoiceId: 'inv', purchaseInvoiceId: 'pinv', cashMethod: 'Cash', cashPaymentDate: date, barterDate: date, offsetJournalId: 'offset', cashJournalId: 'cash-journal', cashAccountId: 'bank',
        invoice: { paidAmount: d(600), totalAmount: d(600) }, purchaseInvoice: { paidAmount: d(cash ? 1000 : 600), totalAmount: d(1000) },
        payments: [{ id: 'ar', barterLeg: 'AR_OFFSET', invoiceId: 'inv', amount: d(600), method: 'Barter' }, { id: 'ap', barterLeg: 'AP_OFFSET', purchaseInvoiceId: 'pinv', amount: d(600), method: 'Barter' }, ...(cash ? [{ id: 'cash', barterLeg: 'AP_CASH', purchaseInvoiceId: 'pinv', amount: d(400), method: 'Cash', paymentDate: date }] : [])] };
    const journal = (isCash: boolean) => ({ id: isCash ? 'cash-journal' : 'offset', referenceType: isCash ? 'PURCHASE_PAYMENT' : 'BARTER_SETTLEMENT', status: 'POSTED', entryDate: date,
        lines: [{ accountId: 'ap', debit: d(isCash ? 400 : 600), credit: d(0), account: { type: 'LIABILITY', isCashAccount: false } }, { accountId: isCash ? 'bank' : 'ar', debit: d(0), credit: d(isCash ? 400 : 600), account: { type: 'ASSET', isCashAccount: isCash } }] });
    const journals = [journal(false), ...(cash ? [journal(true)] : [])];
    const db = { barterSettlement: { findMany: vi.fn().mockResolvedValue([s]) }, payment: { aggregate: vi.fn().mockImplementation(async args => ({ _sum: { amount: d(args.where.invoiceId ? 600 : cash ? 1000 : 600) } })) }, journalEntry: { findMany: vi.fn().mockImplementation(async args => args.where.status === 'POSTED' ? [
        { referenceType: 'SALES_INVOICE', lines: [{ accountId: 'ar', debit: d(600), credit: d(0) }] },
        { referenceType: 'PURCHASE_INVOICE', lines: [{ accountId: 'ap', debit: d(0), credit: d(1000) }] },
    ] : journals) } };
    return { db, s, journals, scan: () => collectBarterHealth(db as unknown as PrismaClient) };
}
describe('barter bounded health', () => {
    it.each([false, true])('validates complete bundle cash=%s', async cash => { expect((await fixture(cash).scan()).issues).toEqual([]); });
    it('checks missing/mismatched legs and aggregate balances, not just method labels', async () => {
        const f = fixture(true); f.s.payments.pop(); f.s.payments[0].amount = d(1); f.s.invoice.paidAmount = d(1);
        expect((await f.scan()).issues.map(i => i.reason)).toEqual(['OFFSET_LEGS_INVALID', 'CASH_LEG_INVALID', 'BALANCE_MISMATCH']);
    });
    it('detects missing/duplicate/unposted journals', async () => {
        const f = fixture(true); f.db.journalEntry.findMany.mockResolvedValue([f.journals[0], f.journals[0]]);
        expect((await f.scan()).issues.map(i => i.reason)).toEqual(['OFFSET_JOURNAL_DUPLICATE', 'CASH_JOURNAL_MISSING']);
    });
    it('rejects bank offset and wrong cash account/amount/date', async () => {
        const f = fixture(true); f.journals[0].lines[1].account.isCashAccount = true; f.journals[1].lines[1].accountId = 'wrong';
        expect((await f.scan()).issues.map(i => i.reason)).toEqual(['OFFSET_JOURNAL_INVALID', 'CASH_JOURNAL_INVALID']);
    });
    it('bounds parents, children and journals and provides a continuation cursor', async () => {
        const f = fixture(); f.db.barterSettlement.findMany.mockResolvedValue(Array.from({ length: 201 }, (_, i) => ({ ...f.s, id: String(i).padStart(3, '0') })));
        const result = await collectBarterHealth(f.db as unknown as PrismaClient, 'before');
        expect(result.truncated).toBe(true); expect(result.nextCursor).toBe('199');
        expect(f.db.barterSettlement.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 201, where: { status: 'POSTED', id: { gt: 'before' } } }));
        expect(f.db.journalEntry.findMany).toHaveBeenCalledTimes(400);
        expect(f.db.journalEntry.findMany.mock.calls[0][0].take).toBe(4);
    });
});
