'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-checks';
import { InvoiceStatus, PurchaseInvoiceStatus, Prisma } from '@prisma/client';

export async function getFinanceDashboardStats(dateRange?: { startDate?: Date, endDate?: Date }) {
    await requireAuth();

    // Base filter for Journal Entries
    const journalEntryConditions: Prisma.JournalEntryWhereInput = { status: 'POSTED' };
    if (dateRange?.startDate && dateRange?.endDate) {
        journalEntryConditions.entryDate = {
            gte: dateRange.startDate,
            lte: dateRange.endDate
        };
    }
    const journalDateFilter = journalEntryConditions;

    // 1. Calculate Revenue (GL: 4xxxx accounts - Credits)
    const revenueAgg = await prisma.journalLine.aggregate({
        where: {
            account: { code: { startsWith: '4' } },
            journalEntry: journalDateFilter
        },
        _sum: { credit: true, debit: true }
    });
    const revenue = (Number(revenueAgg._sum.credit) || 0) - (Number(revenueAgg._sum.debit) || 0);

    // 2. Calculate Receivables (GL: 112xx accounts - Debits)
    const arAgg = await prisma.journalLine.aggregate({
        where: {
            account: { code: { startsWith: '112' } },
            journalEntry: journalDateFilter
        },
        _sum: { debit: true, credit: true }
    });
    const totalReceivables = Number(arAgg._sum.debit || 0) - Number(arAgg._sum.credit || 0);

    // 3. Calculate Payables (GL: 211xx accounts - Credits)
    const apAgg = await prisma.journalLine.aggregate({
        where: {
            account: { code: { startsWith: '211' } },
            journalEntry: journalDateFilter
        },
        _sum: { credit: true, debit: true }
    });
    const totalPayables = Number(apAgg._sum.credit || 0) - Number(apAgg._sum.debit || 0);

    // 4. Counts (Keep operational counts as they are useful for "Pending Work")
    // Note: These are "Current Status" counts, so date filtering might not make sense here unless we want "Invoices created in this period that are currently unpaid".
    // For now, let's keep them as "Current Pending" regardless of date to show work to do.
    const pendingInvoicesCount = await prisma.invoice.count({
        where: { status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE] } }
    });

    const pendingBillsCount = await prisma.purchaseInvoice.count({
        where: { status: { in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.OVERDUE] } }
    });

    // 5. Net Cash Position (GL: 111xx accounts - Debits)
    const cashAgg = await prisma.journalLine.aggregate({
        where: {
            account: { code: { startsWith: '111' } },
            journalEntry: journalDateFilter
        },
        _sum: { debit: true, credit: true }
    });
    const netCashPosition = (Number(cashAgg._sum.debit) || 0) - (Number(cashAgg._sum.credit) || 0);

    return {
        revenue,
        receivables: totalReceivables,
        payables: totalPayables,
        netCashPosition,
        counts: {
            receivables: pendingInvoicesCount,
            payables: pendingBillsCount
        }
    };
}
