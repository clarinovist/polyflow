import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const { createJournalEntry } = vi.hoisted(() => ({
    createJournalEntry: vi.fn(),
}));

vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: { createJournalEntry },
}));

import { BarterJournalService } from '../barter-journal-service';

const account = (
    id: string,
    options: { cash?: boolean; active?: boolean } = {},
) => ({
    id,
    type: options.cash
        ? ('ASSET' as const)
        : id === 'ap'
          ? ('LIABILITY' as const)
          : ('ASSET' as const),
    isActive: options.active ?? true,
    isCashAccount: options.cash ?? false,
});

function transaction() {
    return {
        $queryRaw: vi.fn().mockResolvedValue([]),
        journalEntry: {
            findMany: vi.fn().mockResolvedValue([
                {
                    id: 'purchase-journal',
                    status: 'POSTED',
                    lines: [
                        {
                            accountId: 'expense',
                            debit: new Prisma.Decimal(1000),
                            credit: new Prisma.Decimal(0),
                        },
                        {
                            accountId: 'ap',
                            debit: new Prisma.Decimal(0),
                            credit: new Prisma.Decimal(1000),
                        },
                    ],
                },
            ]),
            findFirst: vi.fn().mockResolvedValue(null),
        },
    } as unknown as Prisma.TransactionClient;
}

describe('BarterJournalService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createJournalEntry.mockReset();
        createJournalEntry
            .mockResolvedValueOnce({ id: 'offset-je', entryNumber: 'JE-1' })
            .mockResolvedValueOnce({ id: 'cash-je', entryNumber: 'JE-2' });
    });

    it('posts one offset journal without any cash account', async () => {
        const tx = transaction();
        const result = await BarterJournalService.postOffset(tx, {
            settlementId: 'settlement-1',
            settlementNumber: 'BRT-00001',
            amount: new Prisma.Decimal(600),
            entryDate: new Date('2026-09-09T00:00:00.000Z'),
            userId: 'user-1',
            salesInvoiceNumber: 'INV-1',
            purchaseInvoiceNumber: 'BILL-1',
            accounts: {
                receivable: account('ar'),
                payable: account('ap'),
            },
        });

        expect(result).toMatchObject({ id: 'offset-je' });
        expect(createJournalEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                referenceType: 'BARTER_SETTLEMENT',
                referenceId: 'settlement-1',
                status: 'POSTED',
                lines: [
                    expect.objectContaining({ accountId: 'ap', debit: 600 }),
                    expect.objectContaining({ accountId: 'ar', credit: 600 }),
                ],
            }),
            tx,
        );
    });

    it('posts optional cash as PURCHASE_PAYMENT', async () => {
        const tx = transaction();
        const result = await BarterJournalService.postCashPayment(tx, {
            paymentId: 'payment-cash',
            paymentNumber: 'PAY-OUT-1',
            amount: new Prisma.Decimal(400),
            entryDate: new Date('2026-09-09T00:00:00.000Z'),
            method: 'Cash',
            destinationBank: null,
            purchaseInvoiceNumber: 'BILL-1',
            userId: 'user-1',
            accounts: {
                receivable: account('ar'),
                payable: account('ap'),
                cash: account('cash', { cash: true }),
            },
        });

        expect(result).toMatchObject({ id: 'offset-je' });
        expect(createJournalEntry).toHaveBeenCalledWith(
            expect.objectContaining({
                referenceType: 'PURCHASE_PAYMENT',
                referenceId: 'payment-cash',
                lines: [
                    expect.objectContaining({ accountId: 'ap', debit: 400 }),
                    expect.objectContaining({ accountId: 'cash', credit: 400 }),
                ],
            }),
            tx,
        );
    });

    it('rejects cash or control account with the wrong classification', async () => {
        const tx = transaction();
        await expect(
            BarterJournalService.postOffset(tx, {
                settlementId: 'settlement-1',
                settlementNumber: 'BRT-1',
                amount: new Prisma.Decimal(1),
                entryDate: new Date(),
                userId: 'user-1',
                salesInvoiceNumber: 'INV-1',
                purchaseInvoiceNumber: 'BILL-1',
                accounts: {
                    receivable: account('ar', { cash: true }),
                    payable: account('ap'),
                },
            }),
        ).rejects.toMatchObject({ code: 'BARTER_CONTROL_ACCOUNT_INVALID' });
    });

    it('requires one posted AP invoice journal with the expected payable value', async () => {
        const tx = transaction();
        await expect(
            BarterJournalService.validatePurchaseInvoiceJournal(
                tx,
                'purchase-1',
                new Prisma.Decimal(1000),
                'ap',
            ),
        ).resolves.toBeUndefined();

        vi.mocked(tx.journalEntry.findMany).mockResolvedValueOnce([]);
        await expect(
            BarterJournalService.validatePurchaseInvoiceJournal(
                tx,
                'purchase-1',
                new Prisma.Decimal(1000),
                'ap',
            ),
        ).rejects.toMatchObject({ code: 'BARTER_PURCHASE_JOURNAL_INVALID' });
    });
});
