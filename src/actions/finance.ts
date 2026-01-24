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
        revalidatePath('/dashboard/sales');
        revalidatePath('/dashboard/purchasing');
        revalidatePath('/dashboard/finance'); // Assuming a finance dashboard might exist or be created

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
 * This is a mock/proxy to get payments linked to Sales Invoices
 */
export async function getReceivedPayments() {
    await requireAuth();
    // In a real scenario, we would query a Payment table.
    // Here we query "Paid" invoices as a proxy for history.
    const payments = await prisma.invoice.findMany({
        where: {
            status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIAL] },
            paidAmount: { gt: 0 }
        },
        orderBy: { updatedAt: 'desc' },
        include: {
            salesOrder: {
                include: {
                    customer: true
                }
            }
        },
        take: 50
    });

    return serializeData(payments.map(p => ({
        id: p.id,
        referenceNumber: p.invoiceNumber,
        date: p.updatedAt, // Using update time as payment time proxy
        entityName: p.salesOrder?.customer?.name || 'Unknown Details',
        amount: Number(p.paidAmount),
        method: 'Bank Transfer', // Mock
        status: 'COMPLETED'
    })));
}

/**
 * Get Sent Payments (Purchasing)
 * This is a mock/proxy to get payments linked to Purchase Invoices
 */
export async function getSentPayments() {
    await requireAuth();
    const payments = await prisma.purchaseInvoice.findMany({
        where: {
            status: { in: [PurchaseInvoiceStatus.PAID, PurchaseInvoiceStatus.PARTIAL] },
            paidAmount: { gt: 0 }
        },
        orderBy: { updatedAt: 'desc' },
        include: {
            purchaseOrder: {
                include: { supplier: true }
            }
        },
        take: 50
    });

    return serializeData(payments.map(p => ({
        id: p.id,
        referenceNumber: p.invoiceNumber,
        date: p.updatedAt,
        entityName: p.purchaseOrder.supplier.name,
        amount: Number(p.paidAmount),
        method: 'Bank Transfer', // Mock
        status: 'COMPLETED'
    })));
}
