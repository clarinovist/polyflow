import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JournalStatus, ReferenceType } from '@prisma/client';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        payment: {
            findUnique: vi.fn(),
        },
        account: {
            findUnique: vi.fn(),
        },
    }
}));

vi.mock('../../accounting/accounting-service', () => ({
    AccountingService: {
        createJournalEntry: vi.fn(),
    }
}));

import { prisma } from '@/lib/core/prisma';
import { AccountingService } from '../../accounting/accounting-service';
import { AutoJournalService } from '../auto-journal-service';

describe('AutoJournalService payment journals', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        vi.mocked(prisma.account.findUnique).mockImplementation(async ({ where }) => ({
            id: `acc-${where.code}`,
            code: where.code,
        }) as never);
    });

    it('uses sales payment id as journal referenceId', async () => {
        const paymentDate = new Date('2026-04-20T10:00:00.000Z');
        vi.mocked(prisma.payment.findUnique).mockResolvedValue({
            id: 'pay-1',
            paymentDate,
            paymentNumber: 'PAY-IN-001',
            invoice: {
                id: 'inv-1',
                invoiceNumber: 'INV-001',
            }
        } as never);

        await AutoJournalService.handleSalesPayment('pay-1', 250000, 'Bank Transfer');

        expect(AccountingService.createJournalEntry).toHaveBeenCalledWith(expect.objectContaining({
            entryDate: paymentDate,
            reference: 'PAY-IN-001',
            referenceType: ReferenceType.SALES_PAYMENT,
            referenceId: 'pay-1',
            status: JournalStatus.POSTED,
        }));
    });

    it('uses purchase payment id as journal referenceId', async () => {
        const paymentDate = new Date('2026-04-20T11:00:00.000Z');
        vi.mocked(prisma.payment.findUnique).mockResolvedValue({
            id: 'pay-2',
            paymentDate,
            paymentNumber: 'PAY-OUT-001',
            purchaseInvoice: {
                id: 'pinv-1',
                invoiceNumber: 'BILL-001',
            }
        } as never);

        await AutoJournalService.handlePurchasePayment('pay-2', 175000, 'Cash');

        expect(AccountingService.createJournalEntry).toHaveBeenCalledWith(expect.objectContaining({
            entryDate: paymentDate,
            reference: 'PAY-OUT-001',
            referenceType: ReferenceType.PURCHASE_PAYMENT,
            referenceId: 'pay-2',
            status: JournalStatus.POSTED,
        }));
    });
});
