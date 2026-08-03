'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireFinanceAccess } from '@/lib/auth/finance-access';
import { serializeData } from '@/lib/utils/utils';

export interface MobileFinanceOverview {
    generatedAt: string;
    highlights: {
        overdueArCount: number;
        overdueArAmount: number;
        overdueApCount: number;
        overdueApAmount: number;
        draftJournalCount: number;
        openReconCount: number;
    };
    recentInvoices: Array<{
        id: string;
        invoiceNumber: string;
        customerName: string;
        type: 'AR' | 'AP';
        dueDate: string;
        amount: number;
        status: string;
    }>;
}

export const getFinanceMobileOverview = withTenant(
    async function getFinanceMobileOverview() {
        return safeAction(async () => {
            await requireFinanceAccess();

            const now = new Date();

            const [arInvoices, apInvoices, draftJournals, openRecons] =
                await Promise.all([
                    prisma.invoice
                        ? prisma.invoice.findMany({
                              where: {
                                  status: {
                                      in: ['UNPAID', 'OVERDUE', 'PARTIAL'],
                                  },
                                  dueDate: { lt: now },
                              },
                              include: {
                                  salesOrder: {
                                      include: {
                                          customer: { select: { name: true } },
                                      },
                                  },
                              },
                              take: 10,
                              orderBy: { dueDate: 'asc' },
                          }).catch(() => [])
                        : Promise.resolve([]),
                    prisma.purchaseInvoice
                        ? prisma.purchaseInvoice.findMany({
                              where: {
                                  status: {
                                      in: ['UNPAID', 'PARTIAL'],
                                  },
                                  dueDate: { lt: now },
                              },
                              include: {
                                  purchaseOrder: {
                                      include: {
                                          supplier: { select: { name: true } },
                                      },
                                  },
                              },
                              take: 10,
                              orderBy: { dueDate: 'asc' },
                          }).catch(() => [])
                        : Promise.resolve([]),
                    prisma.journalEntry
                        ? prisma.journalEntry.count({
                              where: { status: 'DRAFT' },
                          }).catch(() => 0)
                        : Promise.resolve(0),
                    prisma.bankReconciliation
                        ? prisma.bankReconciliation.count({
                              where: { status: { in: ['DRAFT', 'IN_PROGRESS'] } },
                          }).catch(() => 0)
                        : Promise.resolve(0),
                ]);

            const overdueArAmount = arInvoices.reduce(
                (sum: number, inv: { totalAmount: unknown }) =>
                    sum + Number(inv.totalAmount ?? 0),
                0,
            );
            const overdueApAmount = apInvoices.reduce(
                (sum: number, inv: { totalAmount: unknown }) =>
                    sum + Number(inv.totalAmount ?? 0),
                0,
            );

            const recentInvoices = [
                ...arInvoices.map((inv: { id: string; invoiceNumber: string | null; salesOrder?: { customer?: { name: string } | null } | null; dueDate: Date | null; totalAmount: unknown; status: string }) => ({
                    id: inv.id,
                    invoiceNumber: inv.invoiceNumber || inv.id.substring(0, 8),
                    customerName: inv.salesOrder?.customer?.name ?? 'Pelanggan',
                    type: 'AR' as const,
                    dueDate: inv.dueDate
                        ? new Date(inv.dueDate).toISOString()
                        : now.toISOString(),
                    amount: Number(inv.totalAmount ?? 0),
                    status: inv.status,
                })),
                ...apInvoices.map((inv: { id: string; invoiceNumber: string | null; purchaseOrder?: { supplier?: { name: string } } | null; dueDate: Date | null; totalAmount: unknown; status: string }) => ({
                    id: inv.id,
                    invoiceNumber: inv.invoiceNumber || inv.id.substring(0, 8),
                    customerName: inv.purchaseOrder?.supplier?.name ?? 'Supplier',
                    type: 'AP' as const,
                    dueDate: inv.dueDate
                        ? new Date(inv.dueDate).toISOString()
                        : now.toISOString(),
                    amount: Number(inv.totalAmount ?? 0),
                    status: inv.status,
                })),
            ].slice(0, 10);

            const overview: MobileFinanceOverview = {
                generatedAt: new Date().toISOString(),
                highlights: {
                    overdueArCount: arInvoices.length,
                    overdueArAmount,
                    overdueApCount: apInvoices.length,
                    overdueApAmount,
                    draftJournalCount: draftJournals,
                    openReconCount: openRecons,
                },
                recentInvoices,
            };

            return serializeData(overview);
        });
    },
);
