'use server';

import { prisma } from '@/lib/prisma';
import { InvoiceStatus, PurchaseInvoiceStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { CostReportingService } from '@/services/finance/cost-reporting-service';
import { requireAuth } from '@/lib/auth-checks';
import { serializeData } from '@/lib/utils';

/**
 * Checks for overdue invoices and updates their status.
 * Criteria: Due Date < Now AND Status is UNPAID or PARTIAL.
 * This simulates a cron job.
 */
export async function updateOverdueStatuses() {
    const now = new Date();

    try {
        // 1. Update Sales Invoices
        // We rely on Status = UNPAID/PARTIAL as a proxy for paidAmount < totalAmount
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
        revalidatePath('/finance'); // Assuming a finance dashboard might exist or be created

        return {
            success: true,
            salesUpdated: salesResult.count,
            purchasesUpdated: purchaseResult.count,
            message: `Updated ${salesResult.count} sales invoices and ${purchaseResult.count} purchase invoices to OVERDUE.`
        };
    } catch (error) {
        console.error("Failed to update overdue statuses:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred"
        };
    }
}

/**
 * Get Production Cost Report (COGM) for Completed Orders
 */
export async function getProductionCostReport(startDate?: Date | string, endDate?: Date | string) {
    await requireAuth();

    // Normalize dates if passed as strings (from JSON/Client)
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const data = await CostReportingService.getFinishedGoodsCosting(start, end);
    return serializeData(data);
}

/**
 * Get WIP Valuation
 */
export async function getWipValuation() {
    await requireAuth();
    const data = await CostReportingService.getWipValuation();
    return serializeData(data);
}

/**
 * Get Costing for a Specific Order
 */
export async function getOrderCosting(orderId: string) {
    await requireAuth();
    const data = await CostReportingService.getOrderCosting(orderId);
    return serializeData(data);
}
/**
 * Get Received Payments (Sales)
 */
export async function getReceivedPayments() {
    await requireAuth();

    const payments = await prisma.payment.findMany({
        where: {
            invoiceId: { not: null }
        },
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
        orderBy: { paymentDate: 'desc' },
        take: 50
    });

    return serializeData(payments.map(p => ({
        id: p.id,
        referenceNumber: p.paymentNumber,
        date: p.paymentDate,
        entityName: p.invoice?.salesOrder?.customer?.name || 'Unknown Customer',
        amount: Number(p.amount),
        method: p.method,
        status: 'COMPLETED'
    })));
}

/**
 * Get Sent Payments (Purchasing)
 */
export async function getSentPayments() {
    await requireAuth();

    const payments = await prisma.payment.findMany({
        where: {
            purchaseInvoiceId: { not: null }
        },
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
}

/**
 * Record Customer Payment (AR)
 */
export async function recordCustomerPayment(data: {
    invoiceId: string;
    amount: number;
    paymentDate: Date | string;
    method: string;
    notes?: string;
}) {
    await requireAuth();

    try {
        const invoice = await prisma.invoice.findUnique({
            where: { id: data.invoiceId }
        });

        if (!invoice) {
            return { success: false, error: 'Invoice not found' };
        }

        const totalAmount = Number(invoice.totalAmount);
        const currentPaid = Number(invoice.paidAmount);
        const remainingBalance = totalAmount - currentPaid;

        if (data.amount > remainingBalance) {
            return { success: false, error: 'Payment amount exceeds remaining balance' };
        }

        const newPaidAmount = currentPaid + data.amount;
        const newStatus = newPaidAmount >= totalAmount
            ? InvoiceStatus.PAID
            : InvoiceStatus.PARTIAL;

        // Generate payment number
        const { getNextSequence } = await import('@/lib/sequence');
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

        revalidatePath('/finance/payments/received');
        revalidatePath('/finance/invoices/sales');

        return { success: true, message: 'Payment recorded successfully' };
    } catch (error) {
        console.error('Error recording customer payment:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Record Supplier Payment (AP)
 */
export async function recordSupplierPayment(data: {
    invoiceId: string;
    amount: number;
    paymentDate: Date | string;
    method: string;
    notes?: string;
}) {
    await requireAuth();

    try {
        const invoice = await prisma.purchaseInvoice.findUnique({
            where: { id: data.invoiceId }
        });

        if (!invoice) {
            return { success: false, error: 'Purchase invoice not found' };
        }

        const totalAmount = Number(invoice.totalAmount);
        const currentPaid = Number(invoice.paidAmount);
        const remainingBalance = totalAmount - currentPaid;

        if (data.amount > remainingBalance) {
            return { success: false, error: 'Payment amount exceeds remaining balance' };
        }

        const newPaidAmount = currentPaid + data.amount;
        const newStatus = newPaidAmount >= totalAmount
            ? PurchaseInvoiceStatus.PAID
            : PurchaseInvoiceStatus.PARTIAL;

        // Generate payment number
        const { getNextSequence } = await import('@/lib/sequence');
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

        revalidatePath('/finance/payments/sent');
        revalidatePath('/finance/invoices/purchase');

        return { success: true, message: 'Payment recorded successfully' };
    } catch (error) {
        console.error('Error recording supplier payment:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
