'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { InvoiceStatus, PurchaseInvoiceStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { CostReportingService } from '@/services/finance/cost-reporting-service';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import {
    deletePayment as deletePaymentAction,
    getReceivedPayments as getReceivedPaymentsAction,
    getSentPayments as getSentPaymentsAction,
    recordCustomerPayment as recordCustomerPaymentAction,
    recordSupplierPayment as recordSupplierPaymentAction,
} from './payment-actions';

export async function getReceivedPayments(...args: Parameters<typeof getReceivedPaymentsAction>) {
    return getReceivedPaymentsAction(...args);
}

export async function getSentPayments(...args: Parameters<typeof getSentPaymentsAction>) {
    return getSentPaymentsAction(...args);
}

export async function recordCustomerPayment(...args: Parameters<typeof recordCustomerPaymentAction>) {
    return recordCustomerPaymentAction(...args);
}

export async function recordSupplierPayment(...args: Parameters<typeof recordSupplierPaymentAction>) {
    return recordSupplierPaymentAction(...args);
}

export async function deletePayment(...args: Parameters<typeof deletePaymentAction>) {
    return deletePaymentAction(...args);
}

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

