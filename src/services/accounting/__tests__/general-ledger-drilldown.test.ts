import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getGeneralLedgerSummary,
    getGeneralLedgerAccountEntries,
} from '../general-ledger-service';
import { prisma } from '@/lib/core/prisma';
import { AccountType } from '@prisma/client';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        journalLine: {
            findMany: vi.fn(),
            groupBy: vi.fn(),
        },
        account: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
        },
    },
}));

const ASSET = {
    id: 'acc-asset',
    code: '1101',
    name: 'Kas',
    type: AccountType.ASSET,
    category: 'Kas & Bank',
};
const LIAB = {
    id: 'acc-liability',
    code: '2101',
    name: 'Hutang Usaha',
    type: AccountType.LIABILITY,
    category: 'Hutang Lancar',
};

describe('general-ledger drill-down', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getGeneralLedgerSummary', () => {
        it('returns empty summary when no account has activity', async () => {
            vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([] as never);

            const result = await getGeneralLedgerSummary();

            expect(result).toEqual({
                accounts: [],
                grandTotalDebit: 0,
                grandTotalCredit: 0,
            });
            // No account lookup needed when nothing moved.
            expect(prisma.account.findMany).not.toHaveBeenCalled();
        });

        it('aggregates per account and respects debit/credit-normal nature', async () => {
            vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([
                {
                    accountId: 'acc-asset',
                    _sum: { debit: 1000, credit: 200 },
                    _count: { _all: 2 },
                },
                {
                    accountId: 'acc-liability',
                    _sum: { debit: 0, credit: 500 },
                    _count: { _all: 1 },
                },
            ] as never);
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                ASSET,
                LIAB,
            ] as never);

            const result = await getGeneralLedgerSummary();

            expect(result.accounts).toHaveLength(2);
            expect(result.grandTotalDebit).toBe(1000);
            expect(result.grandTotalCredit).toBe(700);

            const asset = result.accounts.find((a) => a.code === '1101');
            expect(asset?.entryCount).toBe(2);
            // Debit-normal: 1000 - 200 = 800
            expect(asset?.endingBalance).toBe(800);

            const liab = result.accounts.find((a) => a.code === '2101');
            // Credit-normal: 500 - 0 = 500
            expect(liab?.endingBalance).toBe(500);
        });

        it('does not hydrate journal lines (payload stays account-sized)', async () => {
            vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([
                {
                    accountId: 'acc-asset',
                    _sum: { debit: 10, credit: 0 },
                    _count: { _all: 1 },
                },
            ] as never);
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                ASSET,
            ] as never);

            await getGeneralLedgerSummary();

            expect(prisma.journalLine.findMany).not.toHaveBeenCalled();
        });

        it('seeds beginning balance from pre-range movement when range given', async () => {
            vi.mocked(prisma.journalLine.groupBy)
                // in-range aggregate
                .mockResolvedValueOnce([
                    {
                        accountId: 'acc-asset',
                        _sum: { debit: 300, credit: 0 },
                        _count: { _all: 1 },
                    },
                ] as never)
                // pre-range aggregate
                .mockResolvedValueOnce([
                    {
                        accountId: 'acc-asset',
                        _sum: { debit: 500, credit: 100 },
                    },
                ] as never);
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                ASSET,
            ] as never);

            const result = await getGeneralLedgerSummary(
                new Date('2026-07-01T00:00:00Z'),
                new Date('2026-07-31T23:59:59Z'),
            );

            const asset = result.accounts[0];
            expect(asset.beginningBalance).toBe(400);
            // 400 opening + 300 debit
            expect(asset.endingBalance).toBe(700);
        });

        it('sorts accounts by code', async () => {
            vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([
                {
                    accountId: 'acc-liability',
                    _sum: { debit: 0, credit: 1 },
                    _count: { _all: 1 },
                },
                {
                    accountId: 'acc-asset',
                    _sum: { debit: 1, credit: 0 },
                    _count: { _all: 1 },
                },
            ] as never);
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                LIAB,
                ASSET,
            ] as never);

            const result = await getGeneralLedgerSummary();

            expect(result.accounts.map((a) => a.code)).toEqual([
                '1101',
                '2101',
            ]);
        });
    });

    describe('getGeneralLedgerAccountEntries', () => {
        it('returns an empty detail when the account does not exist', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null as never);

            const result = await getGeneralLedgerAccountEntries('nope');

            expect(result.entries).toEqual([]);
            expect(result.endingBalance).toBe(0);
            expect(prisma.journalLine.findMany).not.toHaveBeenCalled();
        });

        it('builds a running balance seeded by the beginning balance', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-asset',
                type: AccountType.ASSET,
            } as never);
            vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([
                { accountId: 'acc-asset', _sum: { debit: 500, credit: 100 } },
            ] as never);
            vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
                {
                    debit: 300,
                    credit: 0,
                    description: 'Kas Jul',
                    journalEntry: {
                        id: 'je-10',
                        entryNumber: 'JE-010',
                        entryDate: new Date('2026-07-15T00:00:00Z'),
                        description: 'Receipt Jul',
                        reference: null,
                        referenceType: null,
                    },
                },
                {
                    debit: 0,
                    credit: 50,
                    description: '',
                    journalEntry: {
                        id: 'je-11',
                        entryNumber: 'JE-011',
                        entryDate: new Date('2026-07-16T00:00:00Z'),
                        description: 'Fallback description',
                        reference: 'REF-1',
                        referenceType: 'MANUAL_ENTRY',
                    },
                },
            ] as never);

            const result = await getGeneralLedgerAccountEntries(
                'acc-asset',
                new Date('2026-07-01T00:00:00Z'),
                new Date('2026-07-31T23:59:59Z'),
            );

            expect(result.beginningBalance).toBe(400);
            expect(result.entries[0].balance).toBe(700);
            expect(result.entries[1].balance).toBe(650);
            expect(result.totalDebit).toBe(300);
            expect(result.totalCredit).toBe(50);
            expect(result.endingBalance).toBe(650);
            // Falls back to the entry description when the line has none.
            expect(result.entries[1].description).toBe('Fallback description');
        });

        it('treats credit-normal accounts with inverted sign', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-liability',
                type: AccountType.LIABILITY,
            } as never);
            vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
                {
                    debit: 0,
                    credit: 500,
                    description: 'Hutang',
                    journalEntry: {
                        id: 'je-3',
                        entryNumber: 'JE-003',
                        entryDate: new Date('2026-07-03T00:00:00Z'),
                        description: 'Hutang Pembelian',
                        reference: null,
                        referenceType: null,
                    },
                },
            ] as never);

            const result = await getGeneralLedgerAccountEntries('acc-liability');

            expect(result.endingBalance).toBe(500);
        });
    });

    describe('summary vs detail consistency (anti-drift)', () => {
        it('summary endingBalance equals the last detail running balance', async () => {
            // Same underlying facts fed to both code paths.
            const preRange = [
                { accountId: 'acc-asset', _sum: { debit: 500, credit: 100 } },
            ];
            const from = new Date('2026-07-01T00:00:00Z');
            const to = new Date('2026-07-31T23:59:59Z');

            vi.mocked(prisma.journalLine.groupBy)
                .mockResolvedValueOnce([
                    {
                        accountId: 'acc-asset',
                        _sum: { debit: 300, credit: 50 },
                        _count: { _all: 2 },
                    },
                ] as never)
                .mockResolvedValueOnce(preRange as never);
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                ASSET,
            ] as never);

            const summary = await getGeneralLedgerSummary(from, to);

            vi.clearAllMocks();

            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-asset',
                type: AccountType.ASSET,
            } as never);
            vi.mocked(prisma.journalLine.groupBy).mockResolvedValue(
                preRange as never,
            );
            vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
                {
                    debit: 300,
                    credit: 0,
                    description: 'a',
                    journalEntry: {
                        id: 'je-1',
                        entryNumber: 'JE-001',
                        entryDate: new Date('2026-07-10T00:00:00Z'),
                        description: 'a',
                        reference: null,
                        referenceType: null,
                    },
                },
                {
                    debit: 0,
                    credit: 50,
                    description: 'b',
                    journalEntry: {
                        id: 'je-2',
                        entryNumber: 'JE-002',
                        entryDate: new Date('2026-07-11T00:00:00Z'),
                        description: 'b',
                        reference: null,
                        referenceType: null,
                    },
                },
            ] as never);

            const detail = await getGeneralLedgerAccountEntries(
                'acc-asset',
                from,
                to,
            );

            expect(summary.accounts[0].endingBalance).toBe(
                detail.entries[detail.entries.length - 1].balance,
            );
            expect(summary.accounts[0].endingBalance).toBe(
                detail.endingBalance,
            );
            expect(summary.accounts[0].totalDebit).toBe(detail.totalDebit);
            expect(summary.accounts[0].totalCredit).toBe(detail.totalCredit);
        });
    });
});
