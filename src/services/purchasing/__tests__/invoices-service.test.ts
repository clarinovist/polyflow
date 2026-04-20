import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        purchaseOrder: {
            findUnique: vi.fn(),
        },
        purchaseInvoice: {
            create: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        payment: {
            create: vi.fn(),
        },
        $transaction: vi.fn(async (callback) => callback({
            purchaseInvoice: {
                findUnique: vi.fn(),
                update: vi.fn(),
            },
            payment: {
                create: vi.fn(),
            },
        })),
        user: {
            findMany: vi.fn(),
        },
    }
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('@/lib/utils/sequence', () => ({
    getNextSequence: vi.fn(),
}));

import { prisma } from '@/lib/core/prisma';
import { getNextSequence } from '@/lib/utils/sequence';
import { getPurchaseInvoiceById, recordPayment } from '../invoices-service';

describe('Purchasing invoices service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('records purchase invoice payments in canonical Payment model', async () => {
        const tx = {
            purchaseInvoice: {
                findUnique: vi.fn().mockResolvedValue({
                    id: 'pinv-1',
                    invoiceNumber: 'BILL-001',
                    paidAmount: { toNumber: () => 100000 },
                    totalAmount: { toNumber: () => 300000 },
                }),
                update: vi.fn().mockResolvedValue({
                    id: 'pinv-1',
                    paidAmount: 175000,
                    status: 'PARTIAL',
                }),
            },
            payment: {
                create: vi.fn().mockResolvedValue({
                    id: 'pay-1',
                    paymentNumber: 'PAY-OUT-001',
                }),
            },
        };

        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));
        vi.mocked(getNextSequence).mockResolvedValue('PAY-OUT-001');

        const result = await recordPayment('pinv-1', 75000, 'user-1', {
            paymentDate: new Date('2026-04-20T10:00:00.000Z'),
            method: 'Cash',
            notes: 'Supplier settlement',
        });

        expect(getNextSequence).toHaveBeenCalledWith('PAYMENT_OUT');
        expect(tx.payment.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                purchaseInvoiceId: 'pinv-1',
                paymentNumber: 'PAY-OUT-001',
                amount: 75000,
                method: 'Cash',
                notes: 'Supplier settlement',
            })
        });
        expect(result).toEqual(expect.objectContaining({ paymentId: 'pay-1' }));
    });

    it('defaults supplier payment method when legacy callers do not provide one', async () => {
        const tx = {
            purchaseInvoice: {
                findUnique: vi.fn().mockResolvedValue({
                    id: 'pinv-1',
                    invoiceNumber: 'BILL-001',
                    paidAmount: { toNumber: () => 100000 },
                    totalAmount: { toNumber: () => 300000 },
                }),
                update: vi.fn().mockResolvedValue({
                    id: 'pinv-1',
                    paidAmount: 150000,
                    status: 'PARTIAL',
                }),
            },
            payment: {
                create: vi.fn().mockResolvedValue({
                    id: 'pay-2',
                    paymentNumber: 'PAY-OUT-002',
                }),
            },
        };

        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));
        vi.mocked(getNextSequence).mockResolvedValue('PAY-OUT-002');

        await recordPayment('pinv-1', 50000, 'user-1');

        expect(tx.payment.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                purchaseInvoiceId: 'pinv-1',
                paymentNumber: 'PAY-OUT-002',
                amount: 50000,
                method: 'Bank Transfer',
            })
        });
    });

    it('loads purchase invoice history from canonical payments relation', async () => {
        vi.mocked(prisma.purchaseInvoice.findUnique).mockResolvedValue({
            id: 'pinv-1',
            payments: [
                {
                    id: 'pay-1',
                    paymentNumber: 'PAY-OUT-001',
                    paymentDate: new Date('2026-04-20T10:00:00.000Z'),
                    amount: 75000,
                    method: 'Cash',
                }
            ]
        } as never);

        await getPurchaseInvoiceById('pinv-1');

        expect(prisma.purchaseInvoice.findUnique).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'pinv-1' },
            include: expect.objectContaining({
                payments: expect.objectContaining({
                    orderBy: { paymentDate: 'desc' }
                })
            })
        }));
    });
});