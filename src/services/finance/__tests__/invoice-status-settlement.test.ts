import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    db: {
        payment: { aggregate: vi.fn() },
        invoice: { update: vi.fn() },
        journalEntry: { findMany: vi.fn(), updateMany: vi.fn() },
        $transaction: vi.fn(),
    },
    lock: vi.fn(), recognize: vi.fn(), audit: vi.fn(),
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: mocks.db, getTenantDbFromContext: () => mocks.db }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: mocks.audit }));
vi.mock('../auto-journal-service', () => ({ AutoJournalService: {} }));
vi.mock('../sales-recognition-service', () => ({
    lockSalesInvoice: mocks.lock,
    postSalesInvoiceJournal: mocks.recognize,
    requireOpenJournalPeriod: vi.fn(),
    RECOGNIZED_INVOICE_STATUSES: ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE'],
}));
import { updateInvoiceStatus } from '../invoice-lifecycle-service';
const D = (value: number) => new Prisma.Decimal(value);
const invoice = () => ({
    id: 'invoice', invoiceNumber: 'INV-TEST', status: 'UNPAID',
    totalAmount: D(1000), paidAmount: D(0), creditedAmount: D(0),
    priceAdjustmentAmount: D(0), dueDate: null,
    salesOrder: { entrySource: 'STANDARD' },
});

describe('status-only invoice changes cannot invent settlement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.lock.mockResolvedValue(invoice());
        mocks.db.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
        mocks.db.journalEntry.findMany.mockResolvedValue([]);
        mocks.db.$transaction.mockImplementation(fn => fn(mocks.db));
    });
    it.each([0, 1000])('rejects explicit paidAmount %s without any write', async paidAmount => {
        await expect(updateInvoiceStatus({ id: 'invoice', status: 'PAID', paidAmount }, 'finance'))
            .rejects.toThrow(/pembayaran/i);
        expect(mocks.db.invoice.update).not.toHaveBeenCalled();
        expect(mocks.recognize).not.toHaveBeenCalled();
        expect(mocks.audit).not.toHaveBeenCalled();
    });
    it.each(['PAID', 'PARTIAL', 'OVERDUE'] as const)('rejects unsupported %s on unpaid, not-due invoice', async status => {
        await expect(updateInvoiceStatus({ id: 'invoice', status }, 'finance')).rejects.toThrow();
        expect(mocks.db.invoice.update).not.toHaveBeenCalled();
    });
    it('does not reinterpret missing Payment as permission to clear a historical paid cache', async () => {
        mocks.lock.mockResolvedValue({ ...invoice(), status: 'PAID', paidAmount: D(1000) });
        await expect(updateInvoiceStatus({ id: 'invoice', status: 'UNPAID' }, 'finance')).rejects.toThrow(/rekonsiliasi/i);
        expect(mocks.db.invoice.update).not.toHaveBeenCalled();
    });
    it('rejects the reverse mismatch (Payment exists but cache is zero)', async () => {
        mocks.db.payment.aggregate.mockResolvedValue({ _sum: { amount: D(200) } });
        await expect(updateInvoiceStatus({ id: 'invoice', status: 'UNPAID' }, 'finance')).rejects.toThrow(/rekonsiliasi/i);
    });
    it.each(['PAID', 'PARTIAL', 'OVERDUE', 'UNPAID'] as const)('allows %s only with matching source balance', async status => {
        const paidAmount = status === 'PAID' ? 1000 : status === 'PARTIAL' ? 200 : 0;
        mocks.lock.mockResolvedValue({ ...invoice(), paidAmount: D(paidAmount), dueDate: status === 'OVERDUE' ? new Date('2000-01-01') : null });
        mocks.db.payment.aggregate.mockResolvedValue({ _sum: { amount: D(paidAmount) } });
        await updateInvoiceStatus({ id: 'invoice', status }, 'finance');
        expect(mocks.db.payment.aggregate).toHaveBeenCalledWith({ where: { invoiceId: 'invoice' }, _sum: { amount: true } });
        expect(mocks.db.invoice.update).toHaveBeenCalledWith({ where: { id: 'invoice' }, data: { status } });
        expect(mocks.recognize).toHaveBeenCalledWith(mocks.db, 'invoice', 'finance');
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tx: mocks.db, toStatus: status }));
    });
    it('keeps draft confirmation compatible with an overdue due date', async () => {
        mocks.lock.mockResolvedValue({ ...invoice(), status: 'DRAFT', dueDate: new Date('2000-01-01') });
        await updateInvoiceStatus({ id: 'invoice', status: 'UNPAID' }, 'finance');
        expect(mocks.recognize).toHaveBeenCalledOnce();
    });
    it('rejects cancelling an invoice with real payments rather than voiding revenue', async () => {
        mocks.lock.mockResolvedValue({ ...invoice(), status: 'PARTIAL', paidAmount: D(200) });
        mocks.db.payment.aggregate.mockResolvedValue({ _sum: { amount: D(200) } });
        await expect(updateInvoiceStatus({ id: 'invoice', status: 'CANCELLED' }, 'finance')).rejects.toThrow(/pembayaran/i);
        expect(mocks.db.invoice.update).not.toHaveBeenCalled();
        expect(mocks.db.journalEntry.updateMany).not.toHaveBeenCalled();
    });
    it('rejects a negative balance and preserves legitimate return-credit settlement', async () => {
        mocks.lock.mockResolvedValue({ ...invoice(), status: 'PAID', creditedAmount: D(1000) });
        await updateInvoiceStatus({ id: 'invoice', status: 'PAID' }, 'finance');
        mocks.db.invoice.update.mockClear();
        mocks.lock.mockResolvedValue({ ...invoice(), paidAmount: D(1100) });
        mocks.db.payment.aggregate.mockResolvedValue({ _sum: { amount: D(1100) } });
        await expect(updateInvoiceStatus({ id: 'invoice', status: 'PAID' }, 'finance')).rejects.toThrow();
        expect(mocks.db.invoice.update).not.toHaveBeenCalled();
    });
});
