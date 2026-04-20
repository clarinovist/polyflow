'use server';

import { InvoiceStatus, PurchaseInvoiceStatus, ReferenceType } from '@prisma/client';
import { revalidatePath } from 'next/cache';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { logger } from '@/lib/config/logger';
import { BusinessRuleError, NotFoundError, safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logActivity } from '@/lib/tools/audit';
import { AutoJournalService } from '@/services/finance/auto-journal-service';
import { PurchaseService } from '@/services/purchasing/purchase-service';

export const recordCustomerPayment = withTenant(
async function recordCustomerPayment(data: {
    invoiceId: string;
    amount: number;
    paymentDate: Date | string;
    method: string;
    notes?: string;
}) {
    return safeAction(async () => {
        const session = await requireAuth();

        try {
            const invoice = await prisma.invoice.findUnique({
                where: { id: data.invoiceId }
            });

            if (!invoice) {
                throw new NotFoundError('Invoice', data.invoiceId);
            }

            const totalAmount = Number(invoice.totalAmount);
            const currentPaid = Number(invoice.paidAmount);
            const remainingBalance = totalAmount - currentPaid;

            if (data.amount > remainingBalance) {
                throw new BusinessRuleError('Payment amount exceeds remaining balance');
            }

            const newPaidAmount = currentPaid + data.amount;
            const newStatus = newPaidAmount >= totalAmount
                ? InvoiceStatus.PAID
                : InvoiceStatus.PARTIAL;

            const { getNextSequence } = await import('@/lib/utils/sequence');
            const paymentNumber = await getNextSequence('PAYMENT_IN');

            const payment = await prisma.$transaction(async (tx) => {
                const createdPayment = await tx.payment.create({
                    data: {
                        paymentNumber,
                        paymentDate: new Date(data.paymentDate),
                        amount: data.amount,
                        method: data.method,
                        notes: data.notes,
                        invoiceId: data.invoiceId
                    }
                });

                await tx.invoice.update({
                    where: { id: data.invoiceId },
                    data: {
                        paidAmount: newPaidAmount,
                        status: newStatus
                    }
                });

                return createdPayment;
            });

            await AutoJournalService.handleSalesPayment(payment.id, data.amount, data.method);

            await logActivity({
                userId: session.user.id,
                action: 'RECORD_CUSTOMER_PAYMENT',
                entityType: 'Invoice',
                entityId: data.invoiceId,
                details: `Recorded payment of ${data.amount} for Sales Invoice ${data.invoiceId}`
            });

            revalidatePath('/finance/payments/received');
            revalidatePath('/finance/invoices/sales');

            return { message: 'Payment recorded successfully' };
        } catch (error) {
            if (error instanceof BusinessRuleError || error instanceof NotFoundError) throw error;
            logger.error('Failed to record customer payment', { error, invoiceId: data.invoiceId, module: 'FinancePaymentActions' });
            throw new BusinessRuleError('Failed to record customer payment. Please ensure input is valid.');
        }
    });
}
);

export const recordSupplierPayment = withTenant(
async function recordSupplierPayment(data: {
    invoiceId: string;
    amount: number;
    paymentDate: Date | string;
    method: string;
    notes?: string;
}) {
    return safeAction(async () => {
        const session = await requireAuth();

        try {
            const updated = await PurchaseService.recordPayment(data.invoiceId, data.amount, session.user.id, {
                paymentDate: new Date(data.paymentDate),
                method: data.method,
                notes: data.notes,
            });

            await AutoJournalService.handlePurchasePayment(updated.paymentId, data.amount, data.method);

            await logActivity({
                userId: session.user.id,
                action: 'RECORD_SUPPLIER_PAYMENT',
                entityType: 'PurchaseInvoice',
                entityId: data.invoiceId,
                details: `Recorded payment of ${data.amount} for Purchase Invoice ${data.invoiceId}`
            });

            revalidatePath('/finance/payments/sent');
            revalidatePath('/finance/invoices/purchase');

            return { message: 'Payment recorded successfully' };
        } catch (error) {
            if (error instanceof BusinessRuleError || error instanceof NotFoundError) throw error;
            logger.error('Failed to record supplier payment', { error, invoiceId: data.invoiceId, module: 'FinancePaymentActions' });
            throw new BusinessRuleError('Failed to record supplier payment. Please ensure input is valid.');
        }
    });
}
);

export const deletePayment = withTenant(
async function deletePayment(id: string) {
    return safeAction(async () => {
        await requireAuth();

        try {
            await prisma.$transaction(async (tx) => {
                const payment = await tx.payment.findUnique({
                    where: { id },
                    include: {
                        invoice: true,
                        purchaseInvoice: true
                    }
                });

                if (!payment) throw new NotFoundError('Payment record', id);

                if (payment.invoiceId && payment.invoice) {
                    const newPaid = Number(payment.invoice.paidAmount) - Number(payment.amount);
                    const total = Number(payment.invoice.totalAmount);

                    let newStatus: InvoiceStatus = InvoiceStatus.PARTIAL;
                    if (newPaid <= 0) {
                        newStatus = InvoiceStatus.UNPAID;
                    }

                    if (newPaid < total && payment.invoice.dueDate && new Date(payment.invoice.dueDate) < new Date()) {
                        newStatus = InvoiceStatus.OVERDUE;
                    }

                    await tx.invoice.update({
                        where: { id: payment.invoiceId },
                        data: {
                            paidAmount: newPaid,
                            status: newStatus
                        }
                    });
                } else if (payment.purchaseInvoiceId && payment.purchaseInvoice) {
                    const newPaid = Number(payment.purchaseInvoice.paidAmount) - Number(payment.amount);
                    const total = Number(payment.purchaseInvoice.totalAmount);

                    let newStatus: PurchaseInvoiceStatus = PurchaseInvoiceStatus.PARTIAL;
                    if (newPaid <= 0) {
                        newStatus = PurchaseInvoiceStatus.UNPAID;
                    }

                    if (newPaid < total && payment.purchaseInvoice.dueDate && new Date(payment.purchaseInvoice.dueDate) < new Date()) {
                        newStatus = PurchaseInvoiceStatus.OVERDUE;
                    }

                    await tx.purchaseInvoice.update({
                        where: { id: payment.purchaseInvoiceId },
                        data: {
                            paidAmount: newPaid,
                            status: newStatus
                        }
                    });
                }

                const refType = payment.invoiceId ? ReferenceType.SALES_PAYMENT : ReferenceType.PURCHASE_PAYMENT;

                await tx.journalLine.deleteMany({
                    where: { journalEntry: { referenceId: id, referenceType: refType } }
                });
                await tx.journalEntry.deleteMany({
                    where: { referenceId: id, referenceType: refType }
                });

                await tx.payment.delete({ where: { id } });
            });

            revalidatePath('/finance/payments/received');
            revalidatePath('/finance/payments/sent');
            revalidatePath('/finance/invoices/sales');
            revalidatePath('/finance/invoices/purchase');

            return { message: 'Payment deleted successfully' };
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error('Failed to delete payment', { error, paymentId: id, module: 'FinancePaymentActions' });
            throw new BusinessRuleError('Failed to delete payment. Ensure no dependent records exist.');
        }
    });
}
);