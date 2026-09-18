import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// Tenant wrapper pass-through — tidak ada resolusi tenant di test.
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
    getTenantContext: () => ({ tenantId: 'test-tenant' }),
}));

vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceMutation: vi
        .fn()
        .mockResolvedValue({ user: { id: 'fin-1', role: 'FINANCE' } }),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/config/logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/services/accounting/periods-service', () => ({
    isPeriodOpen: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/services/finance/auto-journal-service', () => ({
    AutoJournalService: {
        handleSalesPayment: vi.fn().mockResolvedValue(undefined),
        handlePurchasePayment: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('@/services/purchasing/purchase-service', () => ({
    PurchaseService: {},
}));

vi.mock('@/services/settings/app-settings-service', () => ({
    getPaymentBanksSetting: vi.fn().mockResolvedValue([]),
}));

// tx client dibagikan ke test lewat closure supaya assertion bisa membacanya.
const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    payment: {
        findUnique: vi.fn(),
        delete: vi.fn().mockResolvedValue({}),
    },
    invoice: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    purchaseInvoice: { update: vi.fn().mockResolvedValue({}) },
    journalEntry: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    journalLine: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    salesRemittanceItem: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    purchaseRemittanceItem: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
};

vi.mock('@/lib/core/prisma', () => ({
    getTenantDbFromContext: () => ({ $transaction: async (fn: (c: unknown) => Promise<unknown>) => fn(tx) }),
    prisma: {
        invoice: { findUnique: vi.fn() },
        payment: { findMany: vi.fn().mockResolvedValue([]) },
        journalEntry: { findMany: vi.fn().mockResolvedValue([]) },
        $transaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) =>
            fn(tx),
        ),
    },
}));

import { deletePayment } from '../payment-mutation-actions';

describe('deletePayment — pembersihan pointer remittance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        tx.journalEntry.findMany.mockResolvedValue([{status:'POSTED',entryDate:new Date('2026-09-18'),lines:[]}]);
        tx.journalEntry.deleteMany.mockResolvedValue({ count: 0 });
        tx.journalLine.deleteMany.mockResolvedValue({ count: 0 });
        tx.invoice.update.mockResolvedValue({});
        tx.$queryRaw.mockResolvedValue([]);
        tx.invoice.findUnique.mockImplementation(async () => {
            const payment = await tx.payment.findUnique();
            return { ...payment.invoice, status: 'PARTIAL', totalAmount: new Prisma.Decimal(payment.invoice.totalAmount), paidAmount: new Prisma.Decimal(payment.invoice.paidAmount), creditedAmount: new Prisma.Decimal(0) };
        });
        tx.purchaseInvoice.update.mockResolvedValue({});
        tx.payment.delete.mockResolvedValue({});
        tx.salesRemittanceItem.updateMany.mockResolvedValue({ count: 0 });
        tx.purchaseRemittanceItem.updateMany.mockResolvedValue({ count: 0 });
    });

    it('melepas SalesRemittanceItem.paymentId agar tidak menggantung setelah payment dihapus', async () => {
        tx.payment.findUnique.mockResolvedValue({
            paymentDate: new Date('2026-09-18'),
            id: 'pay-1',
            amount: 500,
            invoiceId: 'inv-1',
            invoice: {
                id: 'inv-1',
                paidAmount: 500,
                totalAmount: 1000,
                dueDate: null,
            },
            purchaseInvoiceId: null,
            purchaseInvoice: null,
        });

        const res = await deletePayment('pay-1');

        expect(res.success).toBe(true);
        expect(tx.salesRemittanceItem.updateMany).toHaveBeenCalledWith({
            where: { paymentId: 'pay-1' },
            data: { paymentId: null },
        });
        expect(tx.purchaseRemittanceItem.updateMany).toHaveBeenCalledWith({
            where: { paymentId: 'pay-1' },
            data: { paymentId: null },
        });
        expect(tx.payment.delete).toHaveBeenCalledWith({
            where: { id: 'pay-1' },
        });
    });

    it('pembersihan terjadi SEBELUM payment dihapus, di transaksi yang sama', async () => {
        const order: string[] = [];
        tx.salesRemittanceItem.updateMany.mockImplementation(async () => {
            order.push('clear-sales');
            return { count: 1 };
        });
        tx.purchaseRemittanceItem.updateMany.mockImplementation(async () => {
            order.push('clear-purchase');
            return { count: 0 };
        });
        tx.payment.delete.mockImplementation(async () => {
            order.push('delete-payment');
            return {};
        });

        tx.payment.findUnique.mockResolvedValue({
            paymentDate: new Date('2026-09-18'),
            id: 'pay-1',
            amount: 500,
            invoiceId: 'inv-1',
            invoice: {
                id: 'inv-1',
                paidAmount: 500,
                totalAmount: 1000,
                dueDate: null,
            },
            purchaseInvoiceId: null,
            purchaseInvoice: null,
        });

        await deletePayment('pay-1');

        expect(order).toEqual([
            'clear-sales',
            'clear-purchase',
            'delete-payment',
        ]);
    });

    it('menolak penghapusan satu kaki paket barter', async () => {
        tx.payment.findUnique.mockResolvedValue({
            paymentDate: new Date('2026-09-18'),
            id: 'pay-barter',
            barterSettlementId: 'settlement-1',
            amount: 500,
            invoiceId: 'inv-1',
            invoice: {
                id: 'inv-1',
                paidAmount: 500,
                totalAmount: 1000,
                dueDate: null,
            },
            purchaseInvoiceId: null,
            purchaseInvoice: null,
        });

        const res = await deletePayment('pay-barter');

        expect(res).toMatchObject({
            success: false,
            code: 'BARTER_PAYMENT_DELETE_FORBIDDEN',
        });
        expect(tx.payment.delete).not.toHaveBeenCalled();
    });

    it('payment pembelian juga membersihkan pointer PurchaseRemittanceItem', async () => {
        tx.payment.findUnique.mockResolvedValue({
            paymentDate: new Date('2026-09-18'),
            id: 'pay-2',
            amount: 300,
            invoiceId: null,
            invoice: null,
            purchaseInvoiceId: 'pinv-1',
            purchaseInvoice: {
                id: 'pinv-1',
                paidAmount: 300,
                totalAmount: 900,
                dueDate: null,
            },
        });

        const res = await deletePayment('pay-2');

        expect(res.success).toBe(true);
        expect(tx.purchaseRemittanceItem.updateMany).toHaveBeenCalledWith({
            where: { paymentId: 'pay-2' },
            data: { paymentId: null },
        });
    });

    it('payment di periode tertutup ditolak — pointer remittance tidak ikut dilepas', async () => {
        const { isPeriodOpen } =
            await import('@/services/accounting/periods-service');
        vi.mocked(isPeriodOpen).mockResolvedValueOnce(false);

        tx.payment.findUnique.mockResolvedValue({
            paymentDate: new Date('2026-09-18'),
            id: 'pay-3',
            amount: 100,
            invoiceId: 'inv-1',
            invoice: {
                id: 'inv-1',
                paidAmount: 100,
                totalAmount: 100,
                dueDate: null,
            },
            purchaseInvoiceId: null,
            purchaseInvoice: null,
        });
        tx.journalEntry.findMany.mockResolvedValue([
            { id: 'je-1', entryNumber: 'JE-001', entryDate: new Date(), lines: [] },
        ]);

        const res = await deletePayment('pay-3');

        expect(res.success).toBe(false);
        expect(tx.salesRemittanceItem.updateMany).not.toHaveBeenCalled();
        expect(tx.payment.delete).not.toHaveBeenCalled();
    });
});
