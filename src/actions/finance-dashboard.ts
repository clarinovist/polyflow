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

    // 2. Calculate Receivables (GL Account 11210 - Trade Receivables)
    const arAgg = await prisma.journalLine.aggregate({
        where: {
            account: { code: '11210' },
            journalEntry: { status: 'POSTED' }
        },
        _sum: { debit: true, credit: true }
    });
    const totalReceivables = Number(arAgg._sum.debit || 0) - Number(arAgg._sum.credit || 0);

    // 3. Calculate Payables (GL Account 21110 - Trade Payables)
    const apAgg = await prisma.journalLine.aggregate({
        where: {
            account: { code: '21110' },
            journalEntry: { status: 'POSTED' }
        },
        _sum: { debit: true, credit: true }
    });
    const totalPayables = Number(apAgg._sum.credit || 0) - Number(apAgg._sum.debit || 0);

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
