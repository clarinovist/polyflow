import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const { db, audit, periodOpen } = vi.hoisted(() => {
    const db = {
        invoice: { findUnique: vi.fn() },
        journalEntry: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        $queryRaw: vi.fn(),
        $transaction: vi.fn(),
    };
    return { db, audit: vi.fn(), periodOpen: vi.fn() };
});
vi.mock('@/lib/core/prisma', () => ({ prisma: db }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: audit }));
vi.mock('@/services/accounting/periods-service', () => ({ isPeriodOpen: periodOpen }));
vi.mock('@/services/accounting/account-resolver', () => ({
    resolveAccount: vi.fn().mockResolvedValue({ id: 'ar', code: '11210' }),
}));
vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: { createJournalEntry: vi.fn() },
}));
import { AutoJournalService } from '../auto-journal-service';

const amount = new Prisma.Decimal(4382000);
const invoice = { id: 'invoice', invoiceNumber: 'INV-TEST', status: 'PAID', totalAmount: amount };
const journal = {
    id: 'journal', status: 'DRAFT', entryDate: new Date('2026-08-19T00:00:00Z'),
    lines: [
        { accountId: 'ar', debit: amount, credit: new Prisma.Decimal(0) },
        { accountId: 'revenue', debit: new Prisma.Decimal(0), credit: amount },
    ],
};
const ensure = () => AutoJournalService.ensureDocumentJournal('SALES_INVOICE', invoice.id);

describe('sales invoice recognition guards', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.$transaction.mockImplementation((fn) => fn(db));
        db.$queryRaw.mockResolvedValue([{ id: invoice.id }]);
        db.invoice.findUnique.mockResolvedValue(invoice);
        db.journalEntry.findFirst.mockResolvedValue(journal);
        db.journalEntry.findMany.mockResolvedValue([journal]);
        db.journalEntry.update.mockResolvedValue({ ...journal, status: 'POSTED' });
        db.journalEntry.updateMany.mockResolvedValue({ count: 1 });
        periodOpen.mockResolvedValue(true);
    });

    it('posts a paid invoice journal with an atomic audit trail', async () => {
        expect((await ensure()).action).toBe('promoted');
        expect(audit).toHaveBeenCalledWith(expect.objectContaining({
            entityType: 'JournalEntry', entityId: 'journal', fromStatus: 'DRAFT', toStatus: 'POSTED', tx: db,
        }));
        expect(periodOpen).toHaveBeenCalledWith(journal.entryDate, db);
    });

    it('rejects a draft journal in a closed original period', async () => {
        periodOpen.mockResolvedValue(false);
        await expect(ensure()).rejects.toMatchObject({ code: 'FISCAL_PERIOD_CLOSED' });
        expect(db.journalEntry.updateMany).not.toHaveBeenCalled();
    });

    it('never revives a cancelled invoice', async () => {
        db.invoice.findUnique.mockResolvedValue({ ...invoice, status: 'CANCELLED' });
        await expect(ensure()).rejects.toMatchObject({ code: 'INVOICE_CANCELLED' });
        expect(db.journalEntry.updateMany).not.toHaveBeenCalled();
    });

    it('rejects multiple active sales journals', async () => {
        db.journalEntry.findMany.mockResolvedValue([journal, { ...journal, id: 'duplicate' }]);
        await expect(ensure()).rejects.toMatchObject({ code: 'SALES_JOURNAL_DUPLICATE' });
    });

    it('rejects balanced journals whose AR differs from the invoice', async () => {
        db.journalEntry.findMany.mockResolvedValue([{ ...journal, lines: journal.lines.map(line => ({
            ...line, debit: line.debit.div(2), credit: line.credit.div(2),
        })) }]);
        await expect(ensure()).rejects.toMatchObject({ code: 'SALES_JOURNAL_AMOUNT_MISMATCH' });
    });

    it('rejects unbalanced journal lines', async () => {
        db.journalEntry.findMany.mockResolvedValue([{ ...journal, lines: journal.lines.slice(0, 1) }]);
        await expect(ensure()).rejects.toMatchObject({ code: 'SALES_JOURNAL_AMOUNT_MISMATCH' });
    });

    it('keeps a valid already-posted journal idempotent even in a closed period', async () => {
        db.journalEntry.findMany.mockResolvedValue([{ ...journal, status: 'POSTED' }]);
        periodOpen.mockResolvedValue(false);
        expect((await ensure()).action).toBe('exists');
        expect(db.journalEntry.updateMany).not.toHaveBeenCalled();
        expect(audit).not.toHaveBeenCalled();
    });

    it('does not promote a source invoice still in draft', async () => {
        db.invoice.findUnique.mockResolvedValue({ ...invoice, status: 'DRAFT' });
        expect((await ensure()).action).toBe('exists');
        expect(db.journalEntry.updateMany).not.toHaveBeenCalled();
    });
});
