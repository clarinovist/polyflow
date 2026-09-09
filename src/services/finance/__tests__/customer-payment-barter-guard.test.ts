import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../sales-recognition-service', () => ({
    lockSalesInvoice: vi.fn(),
    postSalesInvoiceJournal: vi.fn(),
    requireOpenJournalPeriod: vi.fn(),
}));
vi.mock('../auto-journal-service', () => ({
    AutoJournalService: { handleSalesPayment: vi.fn() },
}));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

import { recordCustomerPaymentInTransaction } from '../customer-payment-service';

describe('recordCustomerPaymentInTransaction barter guard', () => {
    it('rejects a crafted ordinary payment with method Barter before any DB write', async () => {
        const tx = {
            invoice: { update: vi.fn() },
            payment: { create: vi.fn() },
        } as unknown as Prisma.TransactionClient;

        await expect(
            recordCustomerPaymentInTransaction(
                tx,
                {
                    invoiceId: 'invoice-1',
                    amount: 100,
                    paymentDate: new Date(),
                    method: 'Barter',
                },
                'PAY-IN-1',
                'user-1',
            ),
        ).rejects.toMatchObject({
            code: 'BARTER_PAYMENT_REQUIRES_SETTLEMENT',
        });
        expect(tx.payment.create).not.toHaveBeenCalled();
    });
});
