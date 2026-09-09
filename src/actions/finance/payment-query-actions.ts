'use server';

import { Prisma } from '@prisma/client';
import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { requireFinanceAccess } from '@/lib/auth/finance-access';

// Each stream is bounded independently before a globally ordered merge.
// AP cash is a separate stream: its actual date need not equal barterDate.
const HISTORY_LIMIT = 200;
type DateRange = { startDate?: Date; endDate?: Date };
function dateFilter(range?: DateRange) {
    return range?.startDate && range?.endDate
        ? { gte: range.startDate, lte: range.endDate }
        : undefined;
}
const settlementSelect = {
    id: true,
    settlementNumber: true,
    status: true,
} as const;

async function history(
    side: 'ar' | 'ap',
    range?: DateRange,
    demand?: 'customer' | 'legacy-internal',
) {
    const date = dateFilter(range);
    const where: Prisma.PaymentWhereInput =
        side === 'ar'
            ? {
                  invoiceId: { not: null },
                  ...(demand
                      ? {
                            invoice: {
                                salesOrder: {
                                    customerId:
                                        demand === 'customer'
                                            ? { not: null }
                                            : null,
                                },
                            },
                        }
                      : {}),
              }
            : { purchaseInvoiceId: { not: null } };
    where.paymentDate = date;
    const [payments, offsets, cash] = await Promise.all([
        prisma.payment.findMany({
            where,
            take: HISTORY_LIMIT,
            orderBy: [{ paymentDate: 'desc' }, { id: 'desc' }],
            include: {
                barterSettlement: { select: settlementSelect },
                invoice: {
                    select: {
                        salesOrder: {
                            select: {
                                orderNumber: true,
                                customer: { select: { name: true } },
                            },
                        },
                    },
                },
                purchaseInvoice: {
                    select: {
                        purchaseOrder: {
                            select: { supplier: { select: { name: true } } },
                        },
                    },
                },
            },
        }),
        demand === 'legacy-internal'
            ? Promise.resolve([])
            : prisma.barterSettlement.findMany({
                  where: { status: 'VOIDED', barterDate: date },
                  take: HISTORY_LIMIT,
                  orderBy: [{ barterDate: 'desc' }, { id: 'desc' }],
                  include: {
                      customer: { select: { name: true } },
                      supplier: { select: { name: true } },
                  },
              }),
        side === 'ar'
            ? Promise.resolve([])
            : prisma.barterSettlement.findMany({
                  where: {
                      status: 'VOIDED',
                      cashAmount: { gt: 0 },
                      cashPaymentDate: date,
                  },
                  take: HISTORY_LIMIT,
                  orderBy: [{ cashPaymentDate: 'desc' }, { id: 'desc' }],
                  include: { supplier: { select: { name: true } } },
              }),
    ]);
    return serializeData(
        [
            ...payments.map((p) => ({
                id: p.id,
                referenceNumber:
                    p.barterSettlement?.settlementNumber ?? p.paymentNumber,
                paymentNumber: p.paymentNumber,
                settlementId: p.barterSettlement?.id ?? null,
                barterLeg: p.barterLeg,
                date: p.paymentDate,
                entityName:
                    side === 'ar'
                        ? p.invoice?.salesOrder.customer?.name ||
                          `Legacy Internal Stock Build (${p.invoice?.salesOrder.orderNumber ?? '-'})`
                        : p.purchaseInvoice?.purchaseOrder.supplier.name ||
                          'Unknown Supplier',
                amount: Number(p.amount),
                method: p.method,
                instrumentNumber: p.referenceNumber,
                destinationBank: p.destinationBank,
                status: p.barterSettlement?.status ?? 'COMPLETED',
            })),
            ...offsets.map((s) => ({
                id: `barter-voided-${s.id}-${side}`,
                referenceNumber: s.settlementNumber,
                paymentNumber:
                    side === 'ar' ? s.arPaymentNumber : s.apOffsetPaymentNumber,
                settlementId: s.id,
                barterLeg:
                    side === 'ar'
                        ? ('AR_OFFSET' as const)
                        : ('AP_OFFSET' as const),
                date: s.barterDate,
                entityName: side === 'ar' ? s.customer.name : s.supplier.name,
                amount: Number(s.barterAmount),
                method: 'Barter',
                instrumentNumber: null,
                destinationBank: null,
                status: 'VOIDED',
            })),
            ...cash.map((s) => ({
                id: `barter-voided-${s.id}-cash`,
                referenceNumber: s.settlementNumber,
                paymentNumber: s.apCashPaymentNumber!,
                settlementId: s.id,
                barterLeg: 'AP_CASH' as const,
                date: s.cashPaymentDate!,
                entityName: s.supplier.name,
                amount: Number(s.cashAmount),
                method: s.cashMethod!,
                instrumentNumber: s.cashReferenceNumber,
                destinationBank: null,
                status: 'VOIDED',
            })),
        ]
            .sort(
                (a, b) =>
                    b.date.getTime() - a.date.getTime() ||
                    b.id.localeCompare(a.id),
            )
            .slice(0, HISTORY_LIMIT),
    );
}

export const getReceivedPayments = withTenant(
    async function getReceivedPayments(
        range?: DateRange,
        demand?: 'customer' | 'legacy-internal',
    ) {
        return safeAction(async () => {
            await requireFinanceAccess();
            return history('ar', range, demand);
        });
    },
);
export const getSentPayments = withTenant(async function getSentPayments(
    range?: DateRange,
) {
    return safeAction(async () => {
        await requireFinanceAccess();
        return history('ap', range);
    });
});
