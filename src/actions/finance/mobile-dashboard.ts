'use server';

import { withTenant } from '@/lib/core/tenant';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireFinanceAccess } from '@/lib/auth/finance-access';
import { positiveSalesReceivableWhere } from '@/services/finance/sales-receivable-query';

export const getFinanceMobileOverview = withTenant(
    async function getFinanceMobileOverview() {
        return safeAction(async () => {
            await requireFinanceAccess();
            const db = getTenantDbFromContext();
            if (!db) throw new BusinessRuleError('Konteks workspace finance tidak tersedia.');
            const now = new Date();
            // Totals and the bounded feed share one read snapshot, not a sample.
            return db.$transaction(async (tx) => {
                const arWhere: Prisma.InvoiceWhereInput = {
                    ...positiveSalesReceivableWhere(), dueDate: { lt: now },
                };
                // Same net AP definition as AP aging: total less payments.
                const apWhere: Prisma.PurchaseInvoiceWhereInput = {
                    status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                    dueDate: { lt: now }, totalAmount: { gt: tx.purchaseInvoice.fields.paidAmount },
                };
                const [ar, ap, arInvoices, apInvoices, draftJournalCount, openReconCount] = await Promise.all([
                    tx.invoice.aggregate({ where: arWhere, _count: true, _sum: { remainingAmount: true } }),
                    tx.purchaseInvoice.aggregate({ where: apWhere, _count: true, _sum: { totalAmount: true, paidAmount: true } }),
                    tx.invoice.findMany({ where: arWhere, take: 10, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], select: {
                        id: true, invoiceNumber: true, dueDate: true, remainingAmount: true, status: true,
                        salesOrder: { select: { customer: { select: { name: true } } } },
                    } }),
                    tx.purchaseInvoice.findMany({ where: apWhere, take: 10, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], select: {
                        id: true, invoiceNumber: true, dueDate: true, totalAmount: true, paidAmount: true, status: true,
                        purchaseOrder: { select: { supplier: { select: { name: true } } } },
                    } }),
                    tx.journalEntry.count({ where: { status: 'DRAFT' } }),
                    tx.bankReconciliation.count({ where: { status: { in: ['DRAFT', 'IN_PROGRESS'] } } }),
                ]);
                const recentInvoices = [
                    ...arInvoices.map((inv) => ({
                        id: inv.id, invoiceNumber: inv.invoiceNumber || inv.id.substring(0, 8),
                        customerName: inv.salesOrder?.customer?.name ?? 'Pelanggan', type: 'AR' as const,
                        dueDate: inv.dueDate!.toISOString(), amount: Number(inv.remainingAmount), status: inv.status,
                    })),
                    ...apInvoices.map((inv) => ({
                        id: inv.id, invoiceNumber: inv.invoiceNumber || inv.id.substring(0, 8),
                        customerName: inv.purchaseOrder?.supplier?.name ?? 'Supplier', type: 'AP' as const,
                        dueDate: inv.dueDate!.toISOString(), amount: Number(inv.totalAmount.minus(inv.paidAmount)), status: inv.status,
                    })),
                ].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
                return {
                    generatedAt: now.toISOString(),
                    highlights: {
                        overdueArCount: ar._count, overdueArAmount: Number(ar._sum.remainingAmount ?? 0),
                        overdueApCount: ap._count,
                        overdueApAmount: Number((ap._sum.totalAmount ?? new Prisma.Decimal(0)).minus(ap._sum.paidAmount ?? 0)),
                        draftJournalCount, openReconCount,
                    },
                    // Up to ten of each type; AP never disappears behind ten AR.
                    recentInvoices,
                };
            }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
        });
    },
);
