import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        fiscalPeriod: { findUnique: vi.fn() },
        journalEntry: { findFirst: vi.fn(), findUnique: vi.fn().mockResolvedValue(null), deleteMany: vi.fn(), delete: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'je-new', lines: [] }) },
        journalLine: { findMany: vi.fn() },
        account: { findUnique: vi.fn() },
        systemSequence: { update: vi.fn().mockResolvedValue({ value: BigInt(1) }), upsert: vi.fn() },
        $transaction: vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma)),
    }
}));

vi.mock('../../accounting/account-resolver', () => ({
    resolveAccount: vi.fn().mockImplementation(async (role: string) => {
        const map: Record<string, { id: string; code: string; name: string }> = {
            'current-year-earnings': { id: 'acc-cye', code: '33000', name: 'Current Year Earnings' },
            'retained-earnings': { id: 'acc-re', code: '32000', name: 'Retained Earnings' },
        };
        return map[role] || { id: 'acc-unknown', code: '00000', name: 'Unknown' };
    }),
}));

vi.mock('../../accounting/reports-service', () => ({
    getClosingBalances: vi.fn(),
}));

vi.mock('../../accounting/periods-service', () => ({
    isPeriodOpen: vi.fn().mockResolvedValue(true),
}));

import { prisma } from '@/lib/core/prisma';
import { getClosingBalances } from '../../accounting/reports-service';
import { createClosingJournalEntry, createYearEndClosingEntry } from '../journals-service';

describe('createClosingJournalEntry', () => {
    beforeEach(() => vi.clearAllMocks());

    it('creates closing entry that zeroes out revenue and expense accounts', async () => {
        vi.mocked(prisma.fiscalPeriod.findUnique).mockResolvedValue({
            id: 'period-1', name: 'June 2026', year: 2026, month: 6,
            startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30'),
        } as never);

        vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null); // no existing closing
        vi.mocked(getClosingBalances).mockResolvedValue([
            { id: 'acc-rev', type: 'REVENUE', netBalance: 5000000 },
            { id: 'acc-cogs', type: 'EXPENSE', netBalance: 2000000 },
        ]);
        vi.mocked(prisma.account.findUnique).mockResolvedValue({ id: 'acc-cye', code: '33000' } as never);

        const result = await createClosingJournalEntry('period-1', 'user-1');

        expect(result).toBeTruthy();
        // Verify journal was created via prisma.journalEntry.create
        expect(prisma.journalEntry.create).toHaveBeenCalled();
    });

    it('returns null when no balances to close', async () => {
        vi.mocked(prisma.fiscalPeriod.findUnique).mockResolvedValue({
            id: 'period-1', name: 'June 2026', year: 2026, month: 6,
            startDate: new Date('2026-06-01'), endDate: new Date('2026-06-30'),
        } as never);
        vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
        vi.mocked(getClosingBalances).mockResolvedValue([]);

        const result = await createClosingJournalEntry('period-1', 'user-1');
        expect(result).toBeNull();
    });
});

describe('createYearEndClosingEntry', () => {
    beforeEach(() => vi.clearAllMocks());

    it('transfers balance from current year earnings to retained earnings', async () => {
        vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.account.findUnique)
            .mockResolvedValueOnce({ id: 'acc-cye', code: '33000' } as never)
            .mockResolvedValueOnce({ id: 'acc-re', code: '32000' } as never);

        vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
            { debit: { toNumber: () => 100000 }, credit: { toNumber: () => 0 } },
            { debit: { toNumber: () => 0 }, credit: { toNumber: () => 5000000 } },
        ] as never);

        // Mock isPeriodOpen for the year-end date
        const { isPeriodOpen } = await import('../../accounting/periods-service');
        vi.mocked(isPeriodOpen).mockResolvedValue(true);

        const result = await createYearEndClosingEntry(2026, 'user-1');
        expect(result).toBeTruthy();
        expect(prisma.journalEntry.create).toHaveBeenCalled();
    });

    it('throws when no balance in current year earnings', async () => {
        vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.account.findUnique)
            .mockResolvedValueOnce({ id: 'acc-cye', code: '33000' } as never)
            .mockResolvedValueOnce({ id: 'acc-re', code: '32000' } as never);

        vi.mocked(prisma.journalLine.findMany).mockResolvedValue([]);

        await expect(createYearEndClosingEntry(2026, 'user-1')).rejects.toThrow(
            'Tidak ada saldo di Laba Tahun Berjalan'
        );
    });
});
