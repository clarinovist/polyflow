'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-checks';
import { InvoiceStatus, PurchaseInvoiceStatus } from '@prisma/client';

export async function getFinanceDashboardStats() {
    await requireAuth();

    // 1. Calculate Revenue (Total Paid Sales Invoices)
    const revenueAgg = await prisma.invoice.aggregate({
        where: {
            status: InvoiceStatus.PAID
        },
        _sum: {
            paidAmount: true
        }
    });

    // 2. Calculate Receivables (Unpaid + Overdue + Partial)
    const receivablesAgg = await prisma.invoice.aggregate({
        where: {
            status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIAL] }
        },
        _sum: {
            totalAmount: true
        }
    });
    // Subtract paid amount from total to get remaining receivable
    const receivablesPaidAgg = await prisma.invoice.aggregate({
        where: {
            status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIAL] }
        },
        _sum: {
            paidAmount: true
        }
    });

    const totalReceivables = (receivablesAgg._sum.totalAmount?.toNumber() || 0) - (receivablesPaidAgg._sum.paidAmount?.toNumber() || 0);

    // 3. Calculate Payables (Unpaid Purchase Invoices)
    const payablesAgg = await prisma.purchaseInvoice.aggregate({
        where: {
            status: { in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.OVERDUE, PurchaseInvoiceStatus.PARTIAL] }
        },
        _sum: {
            totalAmount: true
        }
    });
    const payablesPaidAgg = await prisma.purchaseInvoice.aggregate({
        where: {
            status: { in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.OVERDUE, PurchaseInvoiceStatus.PARTIAL] }
        },
        _sum: {
            paidAmount: true
        }
    });

    const totalPayables = (payablesAgg._sum.totalAmount?.toNumber() || 0) - (payablesPaidAgg._sum.paidAmount?.toNumber() || 0);

    // 4. Counts
    const pendingInvoicesCount = await prisma.invoice.count({
        where: { status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] } }
    });

    const pendingBillsCount = await prisma.purchaseInvoice.count({
        where: { status: { in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.OVERDUE] } }
    });

    return {
        revenue: revenueAgg._sum.paidAmount?.toNumber() || 0,
        receivables: totalReceivables,
        payables: totalPayables,
        netCashPosition: (revenueAgg._sum.paidAmount?.toNumber() || 0) - totalPayables, // Approximate
        counts: {
            receivables: pendingInvoicesCount,
            payables: pendingBillsCount
        }
    };
}
