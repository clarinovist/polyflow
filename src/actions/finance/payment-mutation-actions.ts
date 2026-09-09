'use server';

import {
    InvoiceStatus,
    PurchaseInvoiceStatus,
    ReferenceType,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { logger } from '@/lib/config/logger';
import {
    BusinessRuleError,
    NotFoundError,
    safeAction,
} from '@/lib/errors/errors';
import { requireFinanceMutation } from '@/lib/auth/finance-access';
import { logActivity } from '@/lib/tools/audit';
import { AutoJournalService } from '@/services/finance/auto-journal-service';
import { PurchaseService } from '@/services/purchasing/purchase-service';
import { normalizePaymentMethodFields } from '@/lib/finance/payment-methods';
import { getPaymentBanksSetting } from '@/services/settings/app-settings-service';

export const recordCustomerPayment = withTenant(
    async function recordCustomerPayment(data: {
        invoiceId: string;
        amount: number;
        paymentDate: Date | string;
        method: string;
        notes?: string;
        referenceNumber?: string;
        destinationBank?: string;
        // Tanggal buku jurnal, kalau perlu dipisah dari paymentDate. Jalur verifikasi
        // remittance mengirim tanggal verifikasi finance untuk keduanya; jalur direct-entry
        // hanya mengisi paymentDate dan jurnal ikut ke sana.
        journalDate?: Date | string;
    }) {
        return safeAction(async () => {
            const session = await requireFinanceMutation();

            try {
                let paymentFields;
                try {
                    const banks = await getPaymentBanksSetting();
                    paymentFields = normalizePaymentMethodFields(
                        {
                            method: data.method,
                            referenceNumber: data.referenceNumber,
                            destinationBank: data.destinationBank,
                        },
                        banks,
                    );
                } catch (validationError) {
                    throw new BusinessRuleError(
                        validationError instanceof Error
                            ? validationError.message
                            : 'Data metode pembayaran tidak valid.',
                    );
                }

                const { getNextSequence, retryOnPaymentNumberConflict } = await import('@/lib/utils/sequence');
                const { recordCustomerPaymentInTransaction } = await import('@/services/finance/customer-payment-service');
                await retryOnPaymentNumberConflict(async () => {
                    // Allocate outside the retried transaction: rollback must not reuse a conflicting number.
                    const paymentNumber = await getNextSequence('PAYMENT_IN');
                    return prisma.$transaction(tx => recordCustomerPaymentInTransaction(
                        tx, { ...data, ...paymentFields }, paymentNumber, session.user.id,
                    ));
                });

                revalidatePath('/finance/payments/received');
                revalidatePath('/finance/invoices/sales');

                return { message: 'Payment recorded successfully' };
            } catch (error) {
                if (
                    error instanceof BusinessRuleError ||
                    error instanceof NotFoundError
                )
                    throw error;
                logger.error('Failed to record customer payment', {
                    error,
                    invoiceId: data.invoiceId,
                    module: 'FinancePaymentActions',
                });
                throw new BusinessRuleError(
                    'Failed to record customer payment. Please ensure input is valid.',
                );
            }
        });
    },
);

export const recordSupplierPayment = withTenant(
    async function recordSupplierPayment(data: {
        invoiceId: string;
        amount: number;
        paymentDate: Date | string;
        method: string;
        notes?: string;
        referenceNumber?: string;
        destinationBank?: string;
        journalDate?: Date | string;
    }) {
        return safeAction(async () => {
            const session = await requireFinanceMutation();

            try {
                let paymentFields;
                try {
                    const banks = await getPaymentBanksSetting();
                    paymentFields = normalizePaymentMethodFields(
                        {
                            method: data.method,
                            referenceNumber: data.referenceNumber,
                            destinationBank: data.destinationBank,
                        },
                        banks,
                    );
                } catch (validationError) {
                    throw new BusinessRuleError(
                        validationError instanceof Error
                            ? validationError.message
                            : 'Data metode pembayaran tidak valid.',
                    );
                }

                // Validate payment date falls in an open fiscal period
                const { isPeriodOpen } =
                    await import('@/services/accounting/periods-service');
                const paymentDate = new Date(data.paymentDate);
                const isOpen = await isPeriodOpen(paymentDate);
                if (!isOpen) {
                    throw new BusinessRuleError(
                        'Payment date falls in a closed fiscal period',
                    );
                }

                // Validate: check for existing payments to prevent duplicates
                const existingPayments = await prisma.payment.findMany({
                    where: { purchaseInvoiceId: data.invoiceId },
                    orderBy: { paymentDate: 'desc' },
                });

                if (existingPayments.length > 0) {
                    const totalExistingPayments = existingPayments.reduce(
                        (sum, p) => sum + Number(p.amount),
                        0,
                    );
                    logger.warn(
                        'Purchase invoice already has payment records',
                        {
                            invoiceId: data.invoiceId,
                            existingPayments: existingPayments.length,
                            totalExistingPayments,
                            newPaymentAmount: data.amount,
                            module: 'FinancePaymentActions',
                        },
                    );
                }

                // Validate: check for existing journal entries for this invoice
                const existingJournals = await prisma.journalEntry.findMany({
                    where: {
                        referenceId: data.invoiceId,
                        referenceType: 'PURCHASE_INVOICE',
                        status: 'POSTED',
                    },
                });

                if (existingJournals.length > 0) {
                    logger.warn(
                        'Purchase invoice already has journal entries',
                        {
                            invoiceId: data.invoiceId,
                            journalCount: existingJournals.length,
                            journalNumbers: existingJournals.map(
                                (j) => j.entryNumber,
                            ),
                            module: 'FinancePaymentActions',
                        },
                    );
                }

                const updated = await PurchaseService.recordPayment(
                    data.invoiceId,
                    data.amount,
                    session.user.id,
                    {
                        paymentDate: new Date(data.paymentDate),
                        method: paymentFields.method,
                        notes: data.notes,
                        referenceNumber: paymentFields.referenceNumber,
                        destinationBank: paymentFields.destinationBank,
                    },
                );

                try {
                    await AutoJournalService.handlePurchasePayment(
                        updated.paymentId,
                        data.amount,
                        paymentFields.method,
                        data.journalDate
                            ? new Date(data.journalDate)
                            : undefined,
                    );
                } catch (journalError) {
                    logger.error(
                        'Auto-journal failed after purchase payment recorded',
                        {
                            error: journalError,
                            paymentId: updated.paymentId,
                            module: 'FinancePaymentActions',
                        },
                    );
                }

                await logActivity({
                    userId: session.user.id,
                    action: 'RECORD_SUPPLIER_PAYMENT',
                    entityType: 'PurchaseInvoice',
                    entityId: data.invoiceId,
                    details: `Recorded payment of ${data.amount} for Purchase Invoice ${data.invoiceId}`,
                });

                revalidatePath('/finance/payments/sent');
                revalidatePath('/finance/invoices/purchase');

                return { message: 'Payment recorded successfully' };
            } catch (error) {
                if (
                    error instanceof BusinessRuleError ||
                    error instanceof NotFoundError
                )
                    throw error;

                // Pass through validation errors with specific messages
                if (
                    error instanceof Error &&
                    error.message.includes('exceeds')
                ) {
                    throw new BusinessRuleError(error.message);
                }

                logger.error('Failed to record supplier payment', {
                    error,
                    invoiceId: data.invoiceId,
                    module: 'FinancePaymentActions',
                });
                throw new BusinessRuleError(
                    'Failed to record supplier payment. Please ensure input is valid.',
                );
            }
        });
    },
);

export const deletePayment = withTenant(async function deletePayment(
    id: string,
) {
    return safeAction(async () => {
        const authSession = await requireFinanceMutation();

        try {
            await prisma.$transaction(async (tx) => {
                const payment = await tx.payment.findUnique({
                    where: { id },
                    include: {
                        invoice: true,
                        purchaseInvoice: true,
                    },
                });

                if (!payment) throw new NotFoundError('Payment record', id);
                if (payment.barterSettlementId) {
                    throw new BusinessRuleError(
                        'Pembayaran ini merupakan bagian paket barter. Gunakan aksi Batalkan Barter agar seluruh kaki dibatalkan secara atomic.',
                        { barterSettlementId: payment.barterSettlementId },
                        'BARTER_PAYMENT_DELETE_FORBIDDEN',
                    );
                }

                // Validate all associated journal entries are in open periods
                const { isPeriodOpen } =
                    await import('@/services/accounting/periods-service');
                const refType = payment.invoiceId
                    ? ReferenceType.SALES_PAYMENT
                    : ReferenceType.PURCHASE_PAYMENT;
                const journals = await tx.journalEntry.findMany({
                    where: { referenceId: id, referenceType: refType },
                });
                for (const journal of journals) {
                    const isOpen = await isPeriodOpen(journal.entryDate, tx);
                    if (!isOpen) {
                        throw new BusinessRuleError(
                            `Cannot delete payment: journal entry ${journal.entryNumber} is in a closed fiscal period`,
                        );
                    }
                }

                if (payment.invoiceId && payment.invoice) {
                    const newPaid =
                        Number(payment.invoice.paidAmount) -
                        Number(payment.amount);
                    const total = Number(payment.invoice.totalAmount);

                    let newStatus: InvoiceStatus = InvoiceStatus.PARTIAL;
                    if (newPaid <= 0) {
                        newStatus = InvoiceStatus.UNPAID;
                    }

                    if (
                        newPaid < total &&
                        payment.invoice.dueDate &&
                        new Date(payment.invoice.dueDate) < new Date()
                    ) {
                        newStatus = InvoiceStatus.OVERDUE;
                    }

                    await tx.invoice.update({
                        where: { id: payment.invoiceId },
                        data: {
                            paidAmount: newPaid,
                            status: newStatus,
                        },
                    });
                } else if (
                    payment.purchaseInvoiceId &&
                    payment.purchaseInvoice
                ) {
                    const newPaid =
                        Number(payment.purchaseInvoice.paidAmount) -
                        Number(payment.amount);
                    const total = Number(payment.purchaseInvoice.totalAmount);

                    let newStatus: PurchaseInvoiceStatus =
                        PurchaseInvoiceStatus.PARTIAL;
                    if (newPaid <= 0) {
                        newStatus = PurchaseInvoiceStatus.UNPAID;
                    }

                    if (
                        newPaid < total &&
                        payment.purchaseInvoice.dueDate &&
                        new Date(payment.purchaseInvoice.dueDate) < new Date()
                    ) {
                        newStatus = PurchaseInvoiceStatus.OVERDUE;
                    }

                    await tx.purchaseInvoice.update({
                        where: { id: payment.purchaseInvoiceId },
                        data: {
                            paidAmount: newPaid,
                            status: newStatus,
                        },
                    });
                }

                await tx.journalLine.deleteMany({
                    where: {
                        journalEntry: {
                            referenceId: id,
                            referenceType: refType,
                        },
                    },
                });
                await tx.journalEntry.deleteMany({
                    where: { referenceId: id, referenceType: refType },
                });

                // Payment yang lahir dari verifikasi setoran ditunjuk oleh
                // SalesRemittanceItem/PurchaseRemittanceItem.paymentId. Kolom itu String?
                // tanpa FK, jadi menghapus Payment TIDAK otomatis membersihkannya dan
                // pointer-nya menggantung — item dianggap "sudah dibayar" saat remittance
                // diproses ulang padahal payment-nya tidak ada. Lepas pointer di transaksi
                // yang sama supaya item kembali bisa diproses.
                await tx.salesRemittanceItem.updateMany({
                    where: { paymentId: id },
                    data: { paymentId: null },
                });
                await tx.purchaseRemittanceItem.updateMany({
                    where: { paymentId: id },
                    data: { paymentId: null },
                });

                await tx.payment.delete({ where: { id } });
            });

            await logActivity({
                userId: authSession.user.id,
                action: 'DELETE_PAYMENT',
                entityType: 'Payment',
                entityId: id,
                details: `Deleted payment ${id}`,
            });

            revalidatePath('/finance/payments/received');
            revalidatePath('/finance/payments/sent');
            revalidatePath('/finance/invoices/sales');
            revalidatePath('/finance/invoices/purchase');

            return { message: 'Payment deleted successfully' };
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof BusinessRuleError
            )
                throw error;
            logger.error('Failed to delete payment', {
                error,
                paymentId: id,
                module: 'FinancePaymentActions',
            });
            throw new BusinessRuleError(
                'Failed to delete payment. Ensure no dependent records exist.',
            );
        }
    });
});
