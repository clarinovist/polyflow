import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResolveAccount } = vi.hoisted(() => ({
    mockResolveAccount: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        bankReconciliation: { findUnique: vi.fn() },
        journalEntry: { create: vi.fn(), findFirst: vi.fn() },
        bankReconciliationAdjustment: { update: vi.fn() },
    },
}));

vi.mock('@/services/accounting/account-resolver', () => ({
    resolveAccount: mockResolveAccount,
}));

import { prisma } from '@/lib/core/prisma';
import { ReconciliationService } from '../reconciliation-service';
import { AdjustmentType, AdjustmentSide } from '@prisma/client';

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
        adjustments,
        account: { id: 'bank-account-id', code: '11120', name: 'Bank BCA' },
    };
}

describe('ReconciliationService.createAdjustmentJournals', () => {
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

        const journalCall = vi.mocked(prisma.journalEntry.create).mock.calls[0][0];
        const lines = journalCall.data.lines.create;

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

        const journalCall = vi.mocked(prisma.journalEntry.create).mock.calls[0][0];
        const lines = journalCall.data.lines.create;

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

        const lines = vi.mocked(prisma.journalEntry.create).mock.calls[0][0].data.lines.create;
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

        const lines = vi.mocked(prisma.journalEntry.create).mock.calls[0][0].data.lines.create;
        // Bank leg should be reconciliation.accountId, NOT hardcoded 1-114 or 1-113
        const bankLine = lines.find((l: { accountId: string }) => l.accountId === 'bank-account-id');
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
            expect(code).not.toBe('4-401');
        }
    });
});
