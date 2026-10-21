import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type StockMovement } from '@prisma/client';
import { reversePackagingJournal } from '../production-packaging-reversal';
vi.mock('../journal-posting', () => ({ generateEntryNumber: vi.fn(async () => 'JE-REVERSE') }));
vi.mock('@/services/finance/sales-recognition-service', () => ({ requireOpenJournalPeriod: vi.fn() }));
const d = (value: number) => new Prisma.Decimal(value);
const db = { journalEntry: { findMany: vi.fn(), create: vi.fn() } };
const tx = db as unknown as Prisma.TransactionClient;
const original = { id: 'source', cost: d(2), companyOwned: true } as StockMovement;
const reversal = { id: 'reverse', createdAt: new Date(), reference: 'VOID: source' } as StockMovement;
describe('production packaging exact journal reversal', () => {
    beforeEach(() => { vi.resetAllMocks(); });
    it('reverses historical accounts, currency and amounts, not current master mapping', async () => {
        db.journalEntry.findMany.mockResolvedValue([{ id: 'journal', entryNumber: 'JE-1', status: 'POSTED', lines: [
            { accountId: 'old-stock', debit: d(0), credit: d(20), currency: 'IDR', exchangeRate: d(1) },
            { accountId: 'old-wip', debit: d(20), credit: d(0), currency: 'IDR', exchangeRate: d(1) },
        ] }]);
        await reversePackagingJournal(tx, original, reversal, 'actor');
        expect(db.journalEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ referenceId: 'reverse', lines: { create: [
            expect.objectContaining({ accountId: 'old-stock', debit: d(20), credit: d(0) }),
            expect.objectContaining({ accountId: 'old-wip', debit: d(0), credit: d(20) }),
        ] } }) });
    });
    it('allows zero-valued custody without a journal but rejects missing owned-value source', async () => {
        db.journalEntry.findMany.mockResolvedValue([]);
        await expect(reversePackagingJournal(tx, { ...original, companyOwned: false }, reversal, 'actor')).resolves.toBeUndefined();
        await expect(reversePackagingJournal(tx, original, reversal, 'actor')).rejects.toThrow('sumber');
    });
    it('rejects unbalanced source rather than generating an approximate inverse', async () => {
        db.journalEntry.findMany.mockResolvedValue([{ status: 'POSTED', lines: [{ debit: d(20), credit: d(0) }] }]);
        await expect(reversePackagingJournal(tx, original, reversal, 'actor')).rejects.toThrow('seimbang');
        expect(db.journalEntry.create).not.toHaveBeenCalled();
    });
});
