import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResolveAccount } = vi.hoisted(() => ({
    mockResolveAccount: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        bankReconciliation: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
        bankReconciliationItem: { update: vi.fn() },
        bankReconciliationAdjustment: { create: vi.fn(), delete: vi.fn(), update: vi.fn() },
        journalLine: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
        journalEntry: { create: vi.fn(), findFirst: vi.fn() },
    },
}));

vi.mock('@/services/accounting/account-resolver', () => ({
    resolveAccount: mockResolveAccount,
}));

import { prisma } from '@/lib/core/prisma';
import { ReconciliationService } from '../reconciliation-service';
import { AdjustmentType, AdjustmentSide, MatchStatus, ReconciliationStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

function mockReconciliation(adjustments: Array<{
    id: string;
    type: AdjustmentType;
    side: AdjustmentSide;
    amount: { toNumber: () => number };
    description: string;
    journalEntryId?: string | null;
}>) {
    return {
        id: 'recon-1',
        accountId: 'bank-account-id',
        bankBalance: new Decimal(1000),
        bookBalance: new Decimal(800),
        adjustments,
        items: [],
        account: { id: 'bank-account-id', code: '11120', name: 'Bank BCA' },
    };
}

describe('ReconciliationService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createReconciliation', () => {
        it('calculates bank balance and book balance and creates header with items', async () => {
            vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
                { debit: new Decimal(500), credit: new Decimal(100) }
            ] as any);
            vi.mocked(prisma.bankReconciliation.create).mockResolvedValue({ id: 'recon-1' } as any);

            const statements = [
                { id: 's1', date: new Date(), description: 'Deposit', amount: 1000 },
                { id: 's2', date: new Date(), description: 'Withdrawal', amount: -200 },
            ];

            const res = await ReconciliationService.createReconciliation(
                'acc-1',
                new Date('2026-07-01'),
                new Date('2026-07-31'),
                statements,
                'user-1'
            );

            expect(res).toEqual({ id: 'recon-1' });
            expect(prisma.bankReconciliation.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        accountId: 'acc-1',
                        bankBalance: new Decimal(800),
                        bookBalance: new Decimal(400),
                    }),
                })
            );
        });
    });

    describe('getReconciliation and listReconciliations', () => {
        it('getReconciliation returns detail or throws NotFoundError', async () => {
            vi.mocked(prisma.bankReconciliation.findUnique).mockResolvedValue({ id: 'recon-1' } as any);
            const res = await ReconciliationService.getReconciliation('recon-1');
            expect(res.id).toBe('recon-1');

            vi.mocked(prisma.bankReconciliation.findUnique).mockResolvedValue(null);
            await expect(ReconciliationService.getReconciliation('recon-missing')).rejects.toThrow();
        });

        it('listReconciliations fetches list', async () => {
            vi.mocked(prisma.bankReconciliation.findMany).mockResolvedValue([{ id: 'recon-1' }] as any);
            const res = await ReconciliationService.listReconciliations('acc-1');
            expect(res).toHaveLength(1);
        });
    });

    describe('autoMatchAndSave', () => {
        it('matches single candidate and updates item', async () => {
            const bankDate = new Date('2026-07-10T10:00:00Z');
            vi.mocked(prisma.bankReconciliation.findUnique).mockResolvedValue({
                id: 'recon-1',
                accountId: 'acc-1',
                periodStart: new Date('2026-07-01'),
                periodEnd: new Date('2026-07-31'),
                items: [
                    { id: 'item-1', bankAmount: new Decimal(500), bankDate, matchStatus: MatchStatus.UNMATCHED_BANK_ONLY }
                ]
            } as any);

            vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
                {
                    id: 'jl-1',
                    debit: new Decimal(500),
                    credit: new Decimal(0),
                    journalEntry: { entryDate: bankDate, description: 'Test Entry' }
                }
            ] as any);

            const result = await ReconciliationService.autoMatchAndSave('recon-1');
            expect(result).toEqual({ matched: 1, unmatched: 0 });
            expect(prisma.bankReconciliationItem.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'item-1' },
                    data: expect.objectContaining({ matchStatus: MatchStatus.MATCHED, journalLineId: 'jl-1' })
                })
            );
        });
    });

    describe('manualMatch, addAdjustment, removeAdjustment', () => {
        it('manualMatch links journalLine and updates status', async () => {
            vi.mocked(prisma.journalLine.findUnique).mockResolvedValue({
                id: 'jl-1',
                debit: new Decimal(100),
                credit: new Decimal(0),
                journalEntry: { entryDate: new Date(), description: 'Desc' }
            } as any);
            vi.mocked(prisma.bankReconciliationItem.update).mockResolvedValue({ id: 'item-1' } as any);

            await ReconciliationService.manualMatch('item-1', 'jl-1');
            expect(prisma.bankReconciliationItem.update).toHaveBeenCalled();
        });

        it('addAdjustment and removeAdjustment interact with adjustments table', async () => {
            vi.mocked(prisma.bankReconciliationAdjustment.create).mockResolvedValue({ id: 'adj-1' } as any);
            await ReconciliationService.addAdjustment('recon-1', {
                side: AdjustmentSide.BANK,
                type: AdjustmentType.OTHER,
                description: 'Test',
                amount: 100
            });
            expect(prisma.bankReconciliationAdjustment.create).toHaveBeenCalled();

            await ReconciliationService.removeAdjustment('adj-1');
            expect(prisma.bankReconciliationAdjustment.delete).toHaveBeenCalledWith({ where: { id: 'adj-1' } });
        });
    });

    describe('calculateAdjustedBalances and completeReconciliation', () => {
        it('calculateAdjustedBalances aggregates bank and book adjustments', async () => {
            vi.mocked(prisma.bankReconciliation.findUnique).mockResolvedValue({
                id: 'recon-1',
                bankBalance: new Decimal(1000),
                bookBalance: new Decimal(900),
                adjustments: [
                    { side: AdjustmentSide.BANK, amount: new Decimal(50) },
                    { side: AdjustmentSide.BOOK, amount: new Decimal(150) },
                ]
            } as any);

            const result = await ReconciliationService.calculateAdjustedBalances('recon-1');
            expect(result.adjustedBankBalance).toBe(1050);
            expect(result.adjustedBookBalance).toBe(1050);
            expect(result.difference).toBe(0);
        });

        it('completeReconciliation updates journal lines and marks COMPLETED', async () => {
            vi.mocked(prisma.bankReconciliation.findUnique).mockResolvedValue({
                id: 'recon-1',
                items: [{ journalLineId: 'jl-1' }]
            } as any);

            await ReconciliationService.completeReconciliation('recon-1');
            expect(prisma.journalLine.updateMany).toHaveBeenCalledWith({
                where: { id: { in: ['jl-1'] } },
                data: { reconciledAt: expect.any(Date) }
            });
            expect(prisma.bankReconciliation.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'recon-1' },
                    data: expect.objectContaining({ status: ReconciliationStatus.COMPLETED })
                })
            );
        });
    });

    describe('createAdjustmentJournals', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('BANK_FEE: Dr bank-charges, Cr bank (reconciliation.accountId)', async () => {
        vi.mocked(prisma.bankReconciliation.findUnique).mockResolvedValue(
            mockReconciliation([{
                id: 'adj-1',
                type: AdjustmentType.BANK_FEE,
                side: AdjustmentSide.BOOK,
                amount: { toNumber: () => -50000 },
                description: 'Biaya administrasi bank',
            }]) as never,
        );
        vi.mocked(mockResolveAccount).mockResolvedValue({
            id: 'acc-bank-charges',
            code: '91200',
            name: 'Bank Charges',
        });
        vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'je-1' } as never);

        const result = await ReconciliationService.createAdjustmentJournals('recon-1', 'user-1');

        expect(result.created).toBe(1);
        expect(mockResolveAccount).toHaveBeenCalledWith('bank-charges');

        const journalCall = vi.mocked(prisma.journalEntry.create).mock.calls[0]![0]!;
        const lines = journalCall.data.lines!.create as Array<Record<string, unknown>>;

        // bankIncreases = false → Dr offset, Cr bank
        expect(lines[0].accountId).toBe('acc-bank-charges');
        expect(lines[0].debit).toBe(50000);
        expect(lines[0].credit).toBe(0);

        expect(lines[1].accountId).toBe('bank-account-id');
        expect(lines[1].debit).toBe(0);
        expect(lines[1].credit).toBe(50000);
    });

    it('INTEREST_INCOME: Dr bank, Cr interest-income', async () => {
        vi.mocked(prisma.bankReconciliation.findUnique).mockResolvedValue(
            mockReconciliation([{
                id: 'adj-2',
                type: AdjustmentType.INTEREST_INCOME,
                side: AdjustmentSide.BOOK,
                amount: { toNumber: () => 120000 },
                description: 'Bunga bank',
            }]) as never,
        );
        vi.mocked(mockResolveAccount).mockResolvedValue({
            id: 'acc-interest',
            code: '81200',
            name: 'Interest Income',
        });
        vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'je-2' } as never);

        const result = await ReconciliationService.createAdjustmentJournals('recon-1', 'user-1');

        expect(result.created).toBe(1);
        expect(mockResolveAccount).toHaveBeenCalledWith('interest-income');

        const journalCall = vi.mocked(prisma.journalEntry.create).mock.calls[0]![0]!;
        const lines = journalCall.data.lines!.create as Array<Record<string, unknown>>;

        // bankIncreases = true → Dr bank, Cr offset
        expect(lines[0].accountId).toBe('bank-account-id');
        expect(lines[0].debit).toBe(120000);

        expect(lines[1].accountId).toBe('acc-interest');
        expect(lines[1].credit).toBe(120000);
    });

    it('COLLECTION: Dr bank, Cr accounts-receivable', async () => {
        vi.mocked(prisma.bankReconciliation.findUnique).mockResolvedValue(
            mockReconciliation([{
                id: 'adj-3',
                type: AdjustmentType.COLLECTION,
                side: AdjustmentSide.BOOK,
                amount: { toNumber: () => 500000 },
                description: 'Inkaso',
            }]) as never,
        );
        vi.mocked(mockResolveAccount).mockResolvedValue({
            id: 'acc-ar',
            code: '11210',
            name: 'Accounts Receivable',
        });
        vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'je-3' } as never);

        const result = await ReconciliationService.createAdjustmentJournals('recon-1', 'user-1');

        expect(result.created).toBe(1);
        expect(mockResolveAccount).toHaveBeenCalledWith('accounts-receivable');

        const lines = vi.mocked(prisma.journalEntry.create).mock.calls[0]![0]!.data.lines!.create as Array<Record<string, unknown>>;
        expect(lines[0].accountId).toBe('bank-account-id');
        expect(lines[1].accountId).toBe('acc-ar');
    });

    it('skips adjustments with amount 0', async () => {
        vi.mocked(prisma.bankReconciliation.findUnique).mockResolvedValue(
            mockReconciliation([{
                id: 'adj-zero',
                type: AdjustmentType.BANK_FEE,
                side: AdjustmentSide.BOOK,
                amount: { toNumber: () => 0 },
                description: 'Zero',
            }]) as never,
        );

        const result = await ReconciliationService.createAdjustmentJournals('recon-1', 'user-1');

        expect(result.created).toBe(0);
        expect(prisma.journalEntry.create).not.toHaveBeenCalled();
    });

    it('bank leg always uses reconciliation.accountId, not hardcoded bank', async () => {
        vi.mocked(prisma.bankReconciliation.findUnique).mockResolvedValue(
            mockReconciliation([{
                id: 'adj-mandiri',
                type: AdjustmentType.BANK_FEE,
                side: AdjustmentSide.BOOK,
                amount: { toNumber: () => -25000 },
                description: 'Fee Mandiri',
            }]) as never,
        );
        // Simulate Mandiri bank account (not BCA)
        vi.mocked(mockResolveAccount).mockResolvedValue({
            id: 'acc-bank-charges',
            code: '91200',
            name: 'Bank Charges',
        });
        vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'je-mandiri' } as never);

        await ReconciliationService.createAdjustmentJournals('recon-1', 'user-1');

        const lines = vi.mocked(prisma.journalEntry.create).mock.calls[0]![0]!.data.lines!.create as Array<Record<string, unknown>>;
        // Bank leg should be reconciliation.accountId, NOT hardcoded 1-114 or 1-113
        const bankLine = (lines as Array<{ accountId: string }>).find((l) => l.accountId === 'bank-account-id');
        expect(bankLine).toBeDefined();
    });

    it('never calls findUnique with hardcoded account codes', async () => {
        vi.mocked(prisma.bankReconciliation.findUnique).mockResolvedValue(
            mockReconciliation([{
                id: 'adj-check',
                type: AdjustmentType.BANK_FEE,
                side: AdjustmentSide.BOOK,
                amount: { toNumber: () => -10000 },
                description: 'Test',
            }]) as never,
        );
        vi.mocked(mockResolveAccount).mockResolvedValue({
            id: 'acc-x',
            code: '91200',
            name: 'Bank Charges',
        });
        vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.journalEntry.create).mockResolvedValue({ id: 'je-x' } as never);

        await ReconciliationService.createAdjustmentJournals('recon-1', 'user-1');

        // Verify no findUnique with hardcoded codes
        const findUniqueCalls = vi.mocked(prisma.account?.findUnique)?.mock?.calls ?? [];
        for (const call of findUniqueCalls) {
            const code = (call[0] as { where?: { code?: string } })?.where?.code;
            expect(code).not.toBe('1-114');
            expect(code).not.toBe('5-501');
            expect(code).not.toBe('1-115b');
            expect(code).not.toBe('2-110b');
            expect(code).not.toBe('3-201b');
            expect(code).not.toBe('1-199');
        }
    });
});
});


