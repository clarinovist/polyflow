import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ db: vi.fn(), source: vi.fn(), audit: vi.fn(), period: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: m.db }));
vi.mock('../invoice-price-source', () => ({ getPriceAdjustmentSource: m.source }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: m.audit }));
vi.mock('../sales-recognition-service', () => ({ requireOpenJournalPeriod: m.period }));
vi.mock('@/services/accounting/journal-posting', () => ({ generateEntryNumber: async () => 'SYN-JE' }));
import { postInvoicePriceAdjustment, reverseInvoicePriceAdjustment } from '../invoice-price-adjustment-service';
const d = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const date = new Date('2026-09-18T00:00:00+07:00');
const data = { invoiceId: 'invoice', sourceItemId: 'item', quantity: '2', newNetUnitPrice: '90', sourceFingerprint: 'a'.repeat(64), expectedRemaining: '1110', postingDate: date, reason: 'Synthetic price agreement', idempotencyKey: '11111111-1111-4111-8111-111111111111', confirmed: true };
function setup(account = 'item-revenue') {
    const invoice = { id: 'invoice', invoiceNumber: 'SYNTHETIC', salesOrderId: 'order', invoiceDate: date, totalAmount: d(1110), paidAmount: d(0), creditedAmount: d(0), priceAdjustmentAmount: d(0) };
    const item = { sourceItemId: 'item', quantity: '10', netAmount: '1000', taxAmount: '110', revenueAccountId: account, availableQuantity: '10', activeAdjustment: false };
    const source = { invoice, sourceJournalId: 'source-journal', fingerprint: data.sourceFingerprint, items: [item], originalLines: [item], sourceLabel: 'Snapshot invoice', journalTax: d(110), accounts: { ar: 'ar', revenue: 'default', vat: 'vat' } };
    m.source.mockResolvedValue(source);
    const tx = {
        $queryRaw: vi.fn(), $executeRaw: vi.fn(),
        invoice: { findUnique: vi.fn(async () => invoice), findUniqueOrThrow: vi.fn(async () => invoice), update: vi.fn() },
        invoicePriceAdjustment: { findUnique: vi.fn(async () => null), findUniqueOrThrow: vi.fn(), aggregate: vi.fn(async () => ({ _sum: {} })), findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }) => data), update: vi.fn(async ({ data }) => data) },
        salesReturnCreditAllocation: { aggregate: vi.fn(async () => ({ _sum: {} })) },
        journalEntry: { create: vi.fn(async (_input: { data: { lines: { create: { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal }[] } } }) => ({ id: 'adjustment-journal' })), findUniqueOrThrow: vi.fn() },
        account: { count: vi.fn(async () => 3) },
    };
    m.db.mockReturnValue({ $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) });
    return { tx, invoice, source };
}
beforeEach(() => { vi.clearAllMocks(); m.audit.mockResolvedValue(undefined); m.period.mockResolvedValue(undefined); });
describe('price adjustment item revenue posting contract', () => {
    it.each(['item-revenue-a', 'item-revenue-b', 'default'])('posts reductions to %s and never rewrites original invoice values', async account => {
        const { tx } = setup(account);
        await postInvoicePriceAdjustment(data, 'actor');
        expect(tx.journalEntry.create.mock.calls[0][0].data.lines.create).toEqual([
            { accountId: 'ar', debit: d(0), credit: d(22.2) },
            { accountId: account, debit: d(20), credit: d(0) },
            { accountId: 'vat', debit: d(2.2), credit: d(0) },
        ]);
        expect(tx.invoice.update).toHaveBeenCalledWith({ where: { id: 'invoice' }, data: { priceAdjustmentAmount: d(-22.2), status: 'UNPAID' } });
        expect(tx.invoicePriceAdjustment.create.mock.calls[0][0].data.sourceEvidence.originalLines[0].revenueAccountId).toBe(account);
        expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ tx, action: 'POST_INVOICE_PRICE_ADJUSTMENT' }));
    });
    it('credits the item account on a price increase', async () => {
        const { tx } = setup(); await postInvoicePriceAdjustment({ ...data, newNetUnitPrice: '120' }, 'actor');
        expect(tx.journalEntry.create.mock.calls[0][0].data.lines.create[1]).toEqual({ accountId: 'item-revenue', debit: d(0), credit: d(40) });
    });
    it('rejects stale mapping fingerprint before creating journal or adjustment', async () => {
        const { tx, source } = setup(); source.fingerprint = 'b'.repeat(64);
        await expect(postInvoicePriceAdjustment(data, 'actor')).rejects.toThrow(/berubah/);
        expect(tx.journalEntry.create).not.toHaveBeenCalled(); expect(tx.invoicePriceAdjustment.create).not.toHaveBeenCalled();
    });
    it('reverses stored journal accounts even when current source cannot be reconstructed', async () => {
        const { tx, invoice } = setup(); invoice.priceAdjustmentAmount = d(-22.2);
        const row = { id: 'adjustment', invoiceId: 'invoice', status: 'POSTED', postingDate: date, totalAmount: d(-22.2), journalId: 'adjustment-journal', sourceEvidence: { originalLines: [{ taxAmount: '110' }] } };
        tx.invoicePriceAdjustment.findUnique.mockResolvedValue(row as never); tx.invoicePriceAdjustment.findUniqueOrThrow.mockResolvedValue(row);
        const lines = [{ accountId: 'ar', debit: d(0), credit: d(22.2), currency: 'IDR', exchangeRate: d(1) }, { accountId: 'historical-item', debit: d(20), credit: d(0), currency: 'IDR', exchangeRate: d(1) }, { accountId: 'vat', debit: d(2.2), credit: d(0), currency: 'IDR', exchangeRate: d(1) }];
        tx.journalEntry.findUniqueOrThrow.mockResolvedValue({ status: 'POSTED', isAutoGenerated: true, reference: 'INVOICE_PRICE:adjustment', lines });
        m.source.mockRejectedValue(new Error('Mapping changed'));
        await reverseInvoicePriceAdjustment({ adjustmentId: 'adjustment', reversalDate: date, reason: 'Synthetic reversal' }, 'actor');
        expect(m.source).not.toHaveBeenCalled();
        expect(tx.journalEntry.create.mock.calls[0][0].data.lines.create).toEqual(lines.map(l => ({ ...l, debit: l.credit, credit: l.debit })));
        expect(tx.invoice.update).toHaveBeenCalledWith({ where: { id: 'invoice' }, data: { priceAdjustmentAmount: d(0), status: 'UNPAID' } });
        expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ tx, action: 'REVERSE_INVOICE_PRICE_ADJUSTMENT' }));
    });
});
