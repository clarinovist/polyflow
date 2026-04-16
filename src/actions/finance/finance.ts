'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { InvoiceStatus, PurchaseInvoiceStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { CostReportingService } from '@/services/finance/cost-reporting-service';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { logActivity } from '@/lib/tools/audit';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

export const updateOverdueStatuses = withTenant(
async function updateOverdueStatuses() {
    return safeAction(async () => {
        const now = new Date();

        try {
            // 1. Update Sales Invoices
            const salesResult = await prisma.invoice.updateMany({
                where: {
                    dueDate: { lt: now },
                    status: {
                        in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL]
                    }
                },
                data: {
                    status: InvoiceStatus.OVERDUE
                }
            });

            // 2. Update Purchase Invoices
            const purchaseResult = await prisma.purchaseInvoice.updateMany({
                where: {
                    dueDate: { lt: now },
                    status: {
                        in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.PARTIAL]
                    }
                },
                data: {
                    status: PurchaseInvoiceStatus.OVERDUE
                }
            });

            // Revalidate relevant paths to reflect changes in UI
            revalidatePath('/sales');
            revalidatePath('/finance/invoices/purchase');
            revalidatePath('/finance'); 

            return {
                salesUpdated: salesResult.count,
                purchasesUpdated: purchaseResult.count,
                message: `Updated ${salesResult.count} sales invoices and ${purchaseResult.count} purchase invoices to OVERDUE.`
            };
        } catch (error) {
            logger.error("Failed to update overdue statuses", { error, module: 'FinanceActions' });
            throw new BusinessRuleError("Failed to update overdue statuses. Please check system constraints.");
        }
    });
}
);

export const getProductionCostReport = withTenant(
async function getProductionCostReport(startDate?: Date | string, endDate?: Date | string) {
    return safeAction(async () => {
        await requireAuth();

        // Normalize dates if passed as strings (from JSON/Client)
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;

        const data = await CostReportingService.getFinishedGoodsCosting(start, end);
        return serializeData(data);
    });
}
);

export const getWipValuation = withTenant(
async function getWipValuation() {
    return safeAction(async () => {
        await requireAuth();
        const data = await CostReportingService.getWipValuation();
        return serializeData(data);
    });
}
);

export const getOrderCosting = withTenant(
async function getOrderCosting(orderId: string) {
    return safeAction(async () => {
        await requireAuth();
        const data = await CostReportingService.getOrderCosting(orderId);
        return serializeData(data);
    });
}
);

export const getReceivedPayments = withTenant(
async function getReceivedPayments(dateRange?: { startDate?: Date, endDate?: Date }, demandType?: 'customer' | 'legacy-internal') {
    return safeAction(async () => {
        await requireAuth();

        const where: Prisma.PaymentWhereInput = {
            invoiceId: { not: null }
        };

        if (dateRange?.startDate && dateRange?.endDate) {
            where.paymentDate = {
                gte: dateRange.startDate,
                lte: dateRange.endDate
            };
        }

        if (demandType === 'customer') {
            where.invoice = {
                salesOrder: {
                    customerId: { not: null }
                }
            };
        } else if (demandType === 'legacy-internal') {
            where.invoice = {
                salesOrder: {
                    customerId: null
                }
            };
        }

        const payments = await prisma.payment.findMany({
            where,
            include: {
                invoice: {
                    include: {
                        salesOrder: {
                            include: {
                                customer: true
                            }
                        }
                    }
                }
            },
            orderBy: { paymentDate: 'desc' }
        });

        return serializeData(payments.map(p => ({
            id: p.id,
            referenceNumber: p.paymentNumber,
            date: p.paymentDate,
            entityName: p.invoice?.salesOrder?.customer?.name
                || (p.invoice?.salesOrder?.orderNumber
                    ? `Legacy Internal Stock Build (${p.invoice.salesOrder.orderNumber})`
                    : 'Legacy Internal Stock Build'),
            amount: Number(p.amount),
            method: p.method,
            status: 'COMPLETED'
        })));
    });
}
);

export const getSentPayments = withTenant(
async function getSentPayments(dateRange?: { startDate?: Date, endDate?: Date }) {
    return safeAction(async () => {
        await requireAuth();

        const where: Prisma.PaymentWhereInput = {
            purchaseInvoiceId: { not: null }
        };

        if (dateRange?.startDate && dateRange?.endDate) {
            where.paymentDate = {
                gte: dateRange.startDate,
                lte: dateRange.endDate
            };
        }

        const payments = await prisma.payment.findMany({
            where,
            include: {
                purchaseInvoice: {
                    include: {
                        purchaseOrder: {
                            include: { supplier: true }
                        }
                    }
                }
            },
            orderBy: { paymentDate: 'desc' },
            take: 50
        });

        return serializeData(payments.map(p => ({
            id: p.id,
            referenceNumber: p.paymentNumber,
            date: p.paymentDate,
            entityName: p.purchaseInvoice?.purchaseOrder.supplier.name || 'Unknown Supplier',
            amount: Number(p.amount),
            method: p.method,
            status: 'COMPLETED'
        })));
    });
}
);

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

            // Generate payment number
            const { getNextSequence } = await import('@/lib/utils/sequence');
            const paymentNumber = await getNextSequence('PAYMENT_IN');

            // Create payment record and update invoice in a transaction
            await prisma.$transaction(async (tx) => {
                // Create payment record
                await tx.payment.create({
                    data: {
                        paymentNumber,
                        paymentDate: new Date(data.paymentDate),
                        amount: data.amount,
                        method: data.method,
                        notes: data.notes,
                        invoiceId: data.invoiceId
                    }
                });

                // Update invoice
                await tx.invoice.update({
                    where: { id: data.invoiceId },
                    data: {
                        paidAmount: newPaidAmount,
                        status: newStatus
                    }
                });
            });

            // Create journal entry
            const { AutoJournalService } = await import('@/services/finance/auto-journal-service');
            await AutoJournalService.handleSalesPayment(data.invoiceId, data.amount, data.method);

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
            logger.error('Failed to record customer payment', { error, invoiceId: data.invoiceId, module: 'FinanceActions' });
            throw new BusinessRuleError("Failed to record customer payment. Please ensure input is valid.");
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
            const invoice = await prisma.purchaseInvoice.findUnique({
                where: { id: data.invoiceId }
            });

            if (!invoice) {
                throw new NotFoundError('Purchase Invoice', data.invoiceId);
            }

            const totalAmount = Number(invoice.totalAmount);
            const currentPaid = Number(invoice.paidAmount);
            const remainingBalance = totalAmount - currentPaid;

            if (data.amount > remainingBalance) {
                throw new BusinessRuleError('Payment amount exceeds remaining balance');
            }

            const newPaidAmount = currentPaid + data.amount;
            const newStatus = newPaidAmount >= totalAmount
                ? PurchaseInvoiceStatus.PAID
                : PurchaseInvoiceStatus.PARTIAL;

            // Generate payment number
            const { getNextSequence } = await import('@/lib/utils/sequence');
            const paymentNumber = await getNextSequence('PAYMENT_OUT');

            // Create payment record and update invoice in a transaction
            await prisma.$transaction(async (tx) => {
                // Create payment record
                await tx.payment.create({
                    data: {
                        paymentNumber,
                        paymentDate: new Date(data.paymentDate),
                        amount: data.amount,
                        method: data.method,
                        notes: data.notes,
                        purchaseInvoiceId: data.invoiceId
                    }
                });

                // Update purchase invoice
                await tx.purchaseInvoice.update({
                    where: { id: data.invoiceId },
                    data: {
                        paidAmount: newPaidAmount,
                        status: newStatus
                    }
                });
            });

            // Create journal entry
            const { AutoJournalService } = await import('@/services/finance/auto-journal-service');
            await AutoJournalService.handlePurchasePayment(data.invoiceId, data.amount, data.method);

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
            logger.error('Failed to record supplier payment', { error, invoiceId: data.invoiceId, module: 'FinanceActions' });
            throw new BusinessRuleError("Failed to record supplier payment. Please ensure input is valid.");
        }
    });
}
);

export const deletePayment = withTenant(
async function deletePayment(id: string) {
    return safeAction(async () => {
        const { requireAuth } = await import('@/lib/tools/auth-checks');
        const { revalidatePath } = await import('next/cache');
        const { ReferenceType, InvoiceStatus, PurchaseInvoiceStatus } = await import('@prisma/client');

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

                if (!payment) throw new NotFoundError("Payment record", id);

                // 1. Revert Invoice Paid Amount & Status
                if (payment.invoiceId && payment.invoice) {
                    const newPaid = Number(payment.invoice.paidAmount) - Number(payment.amount);
                    const total = Number(payment.invoice.totalAmount);

                    let newStatus: InvoiceStatus = InvoiceStatus.PARTIAL;
                    if (newPaid <= 0) {
                        newStatus = InvoiceStatus.UNPAID;
                    }

                    // Check if it should be overdue
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

                // 2. Delete Journal Entries
                const refType = payment.invoiceId ? ReferenceType.SALES_PAYMENT : ReferenceType.PURCHASE_PAYMENT;

                await tx.journalLine.deleteMany({
                    where: { journalEntry: { referenceId: id, referenceType: refType } }
                });
                await tx.journalEntry.deleteMany({
                    where: { referenceId: id, referenceType: refType }
                });

                // 3. Delete Payment Record
                await tx.payment.delete({ where: { id } });
            });

            revalidatePath('/finance/payments/received');
            revalidatePath('/finance/payments/sent');
            revalidatePath('/finance/invoices/sales');
            revalidatePath('/finance/invoices/purchase');

            return { message: "Payment deleted successfully" };
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error('Failed to delete payment', { error, paymentId: id, module: 'FinanceActions' });
            throw new BusinessRuleError("Failed to delete payment. Ensure no dependent records exist.");
        }
    });
}
);
