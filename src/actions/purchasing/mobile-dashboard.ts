'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requirePurchasingAccess } from '@/lib/auth/purchasing-access';
import { serializeData } from '@/lib/utils/utils';

export interface MobilePurchasingOverview {
    generatedAt: string;
    highlights: {
        pendingPrCount: number;
        draftPoCount: number;
        waitingReceiptCount: number;
        overdueApCount: number;
        overdueApAmount: number;
    };
    recentOrders: Array<{
        id: string;
        poNumber: string;
        supplierName: string;
        status: string;
        totalAmount: number;
    }>;
}

export const getPurchasingMobileOverview = withTenant(
    async function getPurchasingMobileOverview() {
        return safeAction(async () => {
            await requirePurchasingAccess();

            const [draftPos, pendingPos, recentPos, overdueInvoices] =
                await Promise.all([
                    prisma.purchaseOrder
                        ? prisma.purchaseOrder.count({
                              where: { status: 'DRAFT' },
                          }).catch(() => 0)
                        : Promise.resolve(0),
                    prisma.purchaseOrder
                        ? prisma.purchaseOrder.count({
                              where: {
                                  status: {
                                      in: ['SENT', 'PARTIAL_RECEIVED'],
                                  },
                              },
                          }).catch(() => 0)
                        : Promise.resolve(0),
                    prisma.purchaseOrder
                        ? prisma.purchaseOrder.findMany({
                              take: 10,
                              orderBy: { updatedAt: 'desc' },
                              include: {
                                  supplier: { select: { name: true } },
                              },
                          }).catch(() => [])
                        : Promise.resolve([]),
                    prisma.purchaseInvoice
                        ? prisma.purchaseInvoice.findMany({
                              where: {
                                  status: { in: ['UNPAID', 'PARTIAL'] },
                                  dueDate: { lt: new Date() },
                              },
                              select: { totalAmount: true },
                          }).catch(() => [])
                        : Promise.resolve([]),
                ]);

            const overdueApAmount = overdueInvoices.reduce(
                (sum: number, inv: { totalAmount: unknown }) =>
                    sum + Number(inv.totalAmount ?? 0),
                0,
            );

            const overview: MobilePurchasingOverview = {
                generatedAt: new Date().toISOString(),
                highlights: {
                    pendingPrCount: 0,
                    draftPoCount: draftPos,
                    waitingReceiptCount: pendingPos,
                    overdueApCount: overdueInvoices.length,
                    overdueApAmount,
                },
                recentOrders: recentPos.map((po) => ({
                    id: po.id,
                    poNumber: po.orderNumber || po.id.substring(0, 8),
                    supplierName: po.supplier?.name ?? 'Supplier',
                    status: po.status,
                    totalAmount: Number(po.totalAmount ?? 0),
                })),
            };

            return serializeData(overview);
        });
    },
);
