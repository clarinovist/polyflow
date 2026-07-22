'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { InvoiceStatus, PurchaseInvoiceStatus, Prisma, JournalStatus, ReconciliationStatus, PeriodStatus } from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';

// Legacy shape kept for any remaining consumers (to be removed once home migrated)
export const getFinanceDashboardStats = withTenant(
async function getFinanceDashboardStats(dateRange?: { startDate?: Date, endDate?: Date }) {
    return safeAction(async () => {
        await requireAuth();
        const journalEntryConditions: Prisma.JournalEntryWhereInput = { status: 'POSTED' };
        if (dateRange?.startDate && dateRange?.endDate) {
            journalEntryConditions.entryDate = {
                gte: dateRange.startDate,
                lte: dateRange.endDate
            };
        }
        const journalDateFilter = journalEntryConditions;
        const revenueAgg = await prisma.journalLine.aggregate({
            where: { account: { code: { startsWith: '4' } }, journalEntry: journalDateFilter },
            _sum: { credit: true, debit: true }
        });
        const revenue = (Number(revenueAgg._sum.credit) || 0) - (Number(revenueAgg._sum.debit) || 0);
        const arAgg = await prisma.journalLine.aggregate({
            where: { account: { code: { startsWith: '112' } }, journalEntry: journalDateFilter },
            _sum: { debit: true, credit: true }
        });
        const totalReceivables = Number(arAgg._sum.debit || 0) - Number(arAgg._sum.credit || 0);
        const apAgg = await prisma.journalLine.aggregate({
            where: { account: { code: { startsWith: '211' } }, journalEntry: journalDateFilter },
            _sum: { credit: true, debit: true }
        });
        const totalPayables = Number(apAgg._sum.credit || 0) - Number(apAgg._sum.debit || 0);
        const pendingInvoicesCount = await prisma.invoice.count({
            where: { status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIAL] } }
        });
        const pendingBillsCount = await prisma.purchaseInvoice.count({
            where: { status: { in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.OVERDUE, PurchaseInvoiceStatus.PARTIAL] } }
        });
        const cashAgg = await prisma.journalLine.aggregate({
            where: { account: { code: { startsWith: '111' } }, journalEntry: journalDateFilter },
            _sum: { debit: true, credit: true }
        });
        const netCashPosition = (Number(cashAgg._sum.debit) || 0) - (Number(cashAgg._sum.credit) || 0);
        return {
            revenue,
            receivables: totalReceivables,
            payables: totalPayables,
            netCashPosition,
            counts: { receivables: pendingInvoicesCount, payables: pendingBillsCount }
        };
    });
}
);

// ---- New shift/command board DTO ----

export type FinanceShiftBoard = {
  queues: {
    arOverdueCount: number;
    arOverdueAmount: number;
    arUnpaidCount: number;
    arUnpaidAmount: number;
    apOverdueCount: number;
    apOverdueAmount: number;
    apUnpaidCount: number;
    apUnpaidAmount: number;
    draftJournals: number;
    openBankRecs: number;
  };
  attention: {
    arOverdue: Array<{ id: string; invoiceNumber: string; customerName: string; remaining: number; dueDate: string | null; totalAmount: number }>;
    apOverdue: Array<{ id: string; invoiceNumber: string; supplierName: string; remaining: number; dueDate: string | null; totalAmount: number }>;
    draftJournals: Array<{ id: string; entryNumber: string; entryDate: string; description: string }>;
  };
  snapshot: {
    revenue: number;
    cashPosition: number;
    arGl: number;
    apGl: number;
    periodLabel: string;
    definitions: {
      revenue: string;
      cash: string;
      arGl: string;
      apGl: string;
    };
  };
  period: {
    openCount: number;
    currentPeriod: { id: string; name: string; endDate: string; status: string } | null;
    daysToMonthEnd: number | null;
    reconThisMonth: number;
  } | null;
};

const BOARD_TAKE = 5;

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  const d = v as { toNumber?: () => number };
  if (typeof d.toNumber === 'function') return d.toNumber() || 0;
  return 0;
}

export const getFinanceShiftBoard = withTenant(
  async function getFinanceShiftBoard(dateRange?: { startDate?: Date; endDate?: Date }) {
    return safeAction(async () => {
      await requireAuth();
      const now = new Date();
      const journalEntryConditions: Prisma.JournalEntryWhereInput = { status: 'POSTED' };
      if (dateRange?.startDate && dateRange?.endDate) {
        journalEntryConditions.entryDate = { gte: dateRange.startDate, lte: dateRange.endDate };
      }

      // Overdue = dueDate < now AND remaining > 0 AND status in UNPAID/PARTIAL/OVERDUE
      const overdueWhereSales: Prisma.InvoiceWhereInput = {
        dueDate: { lt: now },
        status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] },
      };
      const overdueWherePurchase: Prisma.PurchaseInvoiceWhereInput = {
        dueDate: { lt: now },
        status: { in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.PARTIAL, PurchaseInvoiceStatus.OVERDUE] },
      };
      const unpaidWhereSales: Prisma.InvoiceWhereInput = {
        status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] },
      };
      const unpaidWherePurchase: Prisma.PurchaseInvoiceWhereInput = {
        status: { in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.PARTIAL, PurchaseInvoiceStatus.OVERDUE] },
      };

      const [
        arOverdueRows,
        apOverdueRows,
        arUnpaidRows,
        apUnpaidRows,
        draftJournalsCount,
        draftJournalsTop,
        openRecsCount,
        revenueAgg,
        cashAgg,
        arAgg,
        apAgg,
        openPeriods,
        currentMonthPeriod,
        reconThisMonth,
      ] = await Promise.all([
        prisma.invoice.findMany({
          where: overdueWhereSales,
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            dueDate: true,
            salesOrder: { select: { customer: { select: { name: true } } } },
          },
          orderBy: { dueDate: 'asc' },
        }),
        prisma.purchaseInvoice.findMany({
          where: overdueWherePurchase,
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            dueDate: true,
            purchaseOrder: { select: { supplier: { select: { name: true } } } },
          },
          orderBy: { dueDate: 'asc' },
        }),
        prisma.invoice.findMany({
          where: unpaidWhereSales,
          select: { totalAmount: true, paidAmount: true },
        }),
        prisma.purchaseInvoice.findMany({
          where: unpaidWherePurchase,
          select: { totalAmount: true, paidAmount: true },
        }),
        prisma.journalEntry.count({ where: { status: JournalStatus.DRAFT } }),
        prisma.journalEntry.findMany({
          where: { status: JournalStatus.DRAFT },
          select: { id: true, entryNumber: true, entryDate: true, description: true },
          orderBy: { entryDate: 'desc' },
          take: BOARD_TAKE,
        }),
        prisma.bankReconciliation.count({
          where: { status: { in: [ReconciliationStatus.DRAFT, ReconciliationStatus.IN_PROGRESS] } },
        }),
        prisma.journalLine.aggregate({
          where: { account: { code: { startsWith: '4' } }, journalEntry: journalEntryConditions },
          _sum: { credit: true, debit: true },
        }),
        prisma.journalLine.aggregate({
          where: { account: { code: { startsWith: '111' } }, journalEntry: journalEntryConditions },
          _sum: { debit: true, credit: true },
        }),
        prisma.journalLine.aggregate({
          where: { account: { code: { startsWith: '112' } }, journalEntry: journalEntryConditions },
          _sum: { debit: true, credit: true },
        }),
        prisma.journalLine.aggregate({
          where: { account: { code: { startsWith: '211' } }, journalEntry: journalEntryConditions },
          _sum: { credit: true, debit: true },
        }),
        prisma.fiscalPeriod.count({ where: { status: PeriodStatus.OPEN } }),
        prisma.fiscalPeriod.findFirst({
          where: {
            startDate: { lte: now },
            endDate: { gte: now },
          },
          orderBy: { endDate: 'asc' },
        }),
        prisma.bankReconciliation.count({
          where: {
            status: ReconciliationStatus.COMPLETED,
            completedAt: {
              gte: new Date(now.getFullYear(), now.getMonth(), 1),
              lte: now,
            },
          },
        }),
      ]);

      const sumRemaining = (rows: Array<{ totalAmount: unknown; paidAmount: unknown }>) =>
        rows.reduce((acc, r) => acc + (toNumber(r.totalAmount) - toNumber(r.paidAmount)), 0);

      const arOverdueAmount = sumRemaining(arOverdueRows);
      const apOverdueAmount = sumRemaining(apOverdueRows);
      const arUnpaidAmount = sumRemaining(arUnpaidRows);
      const apUnpaidAmount = sumRemaining(apUnpaidRows);

      const revenue = toNumber(revenueAgg._sum.credit) - toNumber(revenueAgg._sum.debit);
      const cashPosition = toNumber(cashAgg._sum.debit) - toNumber(cashAgg._sum.credit);
      const arGl = toNumber(arAgg._sum.debit) - toNumber(arAgg._sum.credit);
      const apGl = toNumber(apAgg._sum.credit) - toNumber(apAgg._sum.debit);

      const startLabel = dateRange?.startDate?.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '';
      const endLabel = dateRange?.endDate?.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) ?? '';
      const periodLabel = startLabel && endLabel ? `${startLabel} – ${endLabel}` : 'Periode berjalan';

      const attentionAr = arOverdueRows.slice(0, BOARD_TAKE).map(r => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        customerName: r.salesOrder?.customer?.name ?? '-',
        remaining: toNumber(r.totalAmount) - toNumber(r.paidAmount),
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        totalAmount: toNumber(r.totalAmount),
      }));

      const attentionAp = apOverdueRows.slice(0, BOARD_TAKE).map(r => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        supplierName: r.purchaseOrder?.supplier?.name ?? '-',
        remaining: toNumber(r.totalAmount) - toNumber(r.paidAmount),
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        totalAmount: toNumber(r.totalAmount),
      }));

      const attentionDraft = draftJournalsTop.map(j => ({
        id: j.id,
        entryNumber: j.entryNumber,
        entryDate: j.entryDate.toISOString(),
        description: j.description,
      }));

      const daysToMonthEnd = currentMonthPeriod
        ? Math.max(0, Math.ceil((new Date(currentMonthPeriod.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : null;

      const board: FinanceShiftBoard = {
        queues: {
          arOverdueCount: arOverdueRows.length,
          arOverdueAmount,
          arUnpaidCount: arUnpaidRows.length,
          arUnpaidAmount,
          apOverdueCount: apOverdueRows.length,
          apOverdueAmount,
          apUnpaidCount: apUnpaidRows.length,
          apUnpaidAmount,
          draftJournals: draftJournalsCount,
          openBankRecs: openRecsCount,
        },
        attention: {
          arOverdue: attentionAr,
          apOverdue: attentionAp,
          draftJournals: attentionDraft,
        },
        snapshot: {
          revenue,
          cashPosition,
          arGl,
          apGl,
          periodLabel,
          definitions: {
            revenue: 'GL akun 4* (POSTED, filter periode)',
            cash: 'GL akun 111* (POSTED, filter periode)',
            arGl: 'GL akun 112* (POSTED, filter periode)',
            apGl: 'GL akun 211* (POSTED, filter periode)',
          },
        },
        period: {
          openCount: openPeriods,
          currentPeriod: currentMonthPeriod ? {
            id: currentMonthPeriod.id,
            name: currentMonthPeriod.name,
            endDate: currentMonthPeriod.endDate.toISOString(),
            status: currentMonthPeriod.status,
          } : null,
          daysToMonthEnd,
          reconThisMonth,
        },
      };

      return board;
    });
  }
);
