import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { diagnoseInvoice, findInvoices } from '../invoice-diagnosis-service';
vi.mock('@/services/accounting/account-resolver', () => ({ resolveByPatterns: vi.fn().mockResolvedValue({ id: 'ar', code: '11210', name: 'AR' }) }));
import { resolveByPatterns } from '@/services/accounting/account-resolver';
const decimal = (v: number) => new Prisma.Decimal(v);
const invoice = { id: 'i', invoiceNumber: 'INV-1', status: 'PAID', totalAmount: decimal(100), paidAmount: decimal(100), invoiceDate: new Date('2026-08-31T17:00:00Z'), dueDate: null, salesOrder: { customer: { name: 'Customer' } } };
const payment = { id: 'p', paymentNumber: 'PAY-1', paymentDate: invoice.invoiceDate, amount: decimal(100), method: 'Cash' };
const journal = (referenceType = 'SALES_INVOICE', referenceId = 'i') => ({
    id: referenceId, entryNumber: `JE-${referenceId}`, entryDate: invoice.invoiceDate, status: 'POSTED', referenceType, referenceId,
    lines: [{ accountId: 'ar', debit: decimal(referenceId === 'i' ? 100 : 0), credit: decimal(referenceId === 'i' ? 0 : 100) }, { accountId: 'other', debit: decimal(referenceId === 'i' ? 0 : 100), credit: decimal(referenceId === 'i' ? 100 : 0) }],
});
function fixture() {
    return { invoice: { findMany: vi.fn().mockResolvedValue([invoice]), count: vi.fn().mockResolvedValue(1) },
        payment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: decimal(100) }, _count: { _all: 1 } }), findMany: vi.fn().mockResolvedValue([payment]) },
        journalEntry: { findMany: vi.fn().mockResolvedValue([journal(), journal('SALES_PAYMENT', 'p')]), count: vi.fn().mockResolvedValue(2) },
        fiscalPeriod: { findMany: vi.fn().mockResolvedValue([{ year: 2026, month: 9, status: 'OPEN' }]) },
    };
}
let mock: ReturnType<typeof fixture>;
const tx = () => mock as unknown as Prisma.TransactionClient;
beforeEach(() => { mock = fixture(); vi.mocked(resolveByPatterns).mockResolvedValue({ id: 'ar', code: '11210', name: 'AR' }); });

describe('invoice selection', () => {
    it('prefers exact number or id and includes SalesOrder customer', async () => {
        const result = await findInvoices(tx(), 'INV-1');
        expect(result.kind).toBe('selected');
        expect(result.invoices[0].salesOrder.customer?.name).toBe('Customer');
        expect(mock.invoice.findMany.mock.calls[0][0]).toMatchObject({ where: { OR: [{ id: 'INV-1' }, { invoiceNumber: { equals: 'INV-1', mode: 'insensitive' } }] } });
        expect(mock.invoice.count).not.toHaveBeenCalled();
    });
    it('returns ambiguity rather than latest partial match', async () => {
        mock.invoice.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([invoice, { ...invoice, id: 'i2' }]);
        mock.invoice.count.mockResolvedValue(7);
        expect(await findInvoices(tx(), 'INV')).toMatchObject({ kind: 'ambiguous', total: 7, truncated: true });
    });
    it('does not choose a case-insensitive exact collision', async () => {
        mock.invoice.findMany.mockResolvedValue([invoice, { ...invoice, id: 'i2' }]);
        expect((await findInvoices(tx(), 'INV-1')).kind).toBe('ambiguous');
    });
    it('counts all exact collisions even when the candidate sample is bounded', async () => {
        mock.invoice.findMany.mockResolvedValue(Array.from({ length: 6 }, (_, n) => ({ ...invoice, id: `i${n}` })));
        mock.invoice.count.mockResolvedValue(8);
        expect(await findInvoices(tx(), 'INV-1')).toMatchObject({ kind: 'ambiguous', total: 8, truncated: true });
    });
    it('handles missing and a unique partial result', async () => {
        mock.invoice.findMany.mockResolvedValue([]); mock.invoice.count.mockResolvedValue(0);
        expect((await diagnoseInvoice(tx(), 'absent')).selection.kind).toBe('missing');
        expect(mock.payment.aggregate).not.toHaveBeenCalled();
        mock.invoice.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([invoice]); mock.invoice.count.mockResolvedValue(1);
        expect((await findInvoices(tx(), 'Customer')).kind).toBe('selected');
    });
});

describe('invoice diagnosis', () => {
    it('compares complete payment aggregate and posted journal amounts using WIB period', async () => {
        const result = await diagnoseInvoice(tx(), 'INV-1');
        expect(result.diagnosis).toMatchObject({ paymentTotal: 100, paymentCount: 1, issues: [], journalCount: 2 });
        expect(mock.fiscalPeriod.findMany.mock.calls[0][0]).toMatchObject({ where: { OR: [{ year: 2026, month: 9 }] } });
    });
    it('flags payment sum, paid status and overpayment inconsistencies', async () => {
        mock.payment.aggregate.mockResolvedValue({ _sum: { amount: decimal(110) }, _count: { _all: 1 } });
        mock.invoice.findMany.mockResolvedValue([{ ...invoice, paidAmount: decimal(90) }]);
        expect((await diagnoseInvoice(tx(), 'INV-1')).diagnosis?.issues).toEqual(expect.arrayContaining(['PAYMENT_TOTAL_MISMATCH', 'INVOICE_STATUS_MISMATCH', 'OVERPAYMENT']));
    });
    it('reports missing journals and missing period, never assumes paid equals recognized', async () => {
        mock.journalEntry.findMany.mockResolvedValue([]); mock.journalEntry.count.mockResolvedValue(0); mock.fiscalPeriod.findMany.mockResolvedValue([]);
        expect((await diagnoseInvoice(tx(), 'INV-1')).diagnosis?.issues).toEqual(expect.arrayContaining(['SALES_JOURNAL_MISSING', 'PAYMENT_JOURNAL_MISSING:p', 'PERIOD_MISSING:2026-09']));
    });
    it('checks duplicate, draft, balance, AR amount and journal date', async () => {
        mock.journalEntry.findMany.mockResolvedValue([journal(), { ...journal(), id: 'duplicate', status: 'DRAFT', entryDate: new Date('2026-08-01Z'), lines: [{ accountId: 'ar', debit: decimal(40), credit: decimal(0) }] }]);
        expect((await diagnoseInvoice(tx(), 'INV-1')).diagnosis?.issues).toEqual(expect.arrayContaining(['SALES_JOURNAL_DUPLICATE', 'JOURNAL_NOT_POSTED:duplicate', 'JOURNAL_UNBALANCED:duplicate', 'JOURNAL_AR_MISMATCH:duplicate', 'JOURNAL_DATE_MISMATCH:duplicate']));
    });
    it('closed period is evidence, not corruption for an already posted journal', async () => {
        mock.fiscalPeriod.findMany.mockResolvedValue([{ year: 2026, month: 9, status: 'CLOSED' }]);
        const result = await diagnoseInvoice(tx(), 'INV-1');
        expect(result.diagnosis?.issues).toEqual([]);
        expect(result.diagnosis?.periods[0].status).toBe('CLOSED');
    });
    it('does not infer lost revenue from a draft invoice', async () => {
        mock.invoice.findMany.mockResolvedValue([{ ...invoice, status: 'DRAFT', paidAmount: decimal(0) }]);
        mock.payment.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: { _all: 0 } }); mock.payment.findMany.mockResolvedValue([]);
        mock.journalEntry.findMany.mockResolvedValue([{ ...journal(), status: 'DRAFT' }]); mock.journalEntry.count.mockResolvedValue(1);
        expect((await diagnoseInvoice(tx(), 'INV-1')).diagnosis?.issues).not.toContain('JOURNAL_NOT_POSTED:i');
    });
    it('marks bounded evidence partial without reducing aggregate totals', async () => {
        mock.payment.aggregate.mockResolvedValue({ _sum: { amount: decimal(300) }, _count: { _all: 30 } }); mock.journalEntry.count.mockResolvedValue(50);
        expect((await diagnoseInvoice(tx(), 'INV-1')).diagnosis).toMatchObject({ paymentTotal: 300, paymentCount: 30, journalCount: 50, truncated: true });
    });
    it('reports unavailable AR mapping but propagates database errors', async () => {
        const { NotFoundError } = await import('@/lib/errors/errors');
        vi.mocked(resolveByPatterns).mockRejectedValueOnce(new NotFoundError('Account', 'ar'));
        expect((await diagnoseInvoice(tx(), 'INV-1')).diagnosis?.issues).toContain('AR_ACCOUNT_UNRESOLVED');
        vi.mocked(resolveByPatterns).mockRejectedValueOnce(new Error('DB unavailable'));
        await expect(diagnoseInvoice(tx(), 'INV-1')).rejects.toThrow('DB unavailable');
    });
});
