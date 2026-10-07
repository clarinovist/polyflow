'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requirePurchasingAccess } from '@/lib/auth/purchasing-access';
import { Prisma } from '@prisma/client';

export const getPurchasingMobileOverview = withTenant(async function getPurchasingMobileOverview() {
    return safeAction(async () => {
        await requirePurchasingAccess();
        const [draftPoCount, waitingReceiptCount, recentPos, ap] = await Promise.all([
            prisma.purchaseOrder.count({ where: { status: 'DRAFT' } }),
            prisma.purchaseOrder.count({ where: { status: { in: ['SENT', 'PARTIAL_RECEIVED'] } } }),
            prisma.purchaseOrder.findMany({ take: 10, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], include: { supplier: { select: { name: true } } } }),
            prisma.purchaseInvoice.aggregate({
                where: { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] }, dueDate: { lt: new Date() }, totalAmount: { gt: prisma.purchaseInvoice.fields.paidAmount } },
                _count: true, _sum: { totalAmount: true, paidAmount: true },
            }),
        ]);
        return {
            generatedAt: new Date().toISOString(),
            highlights: {
                draftPoCount, waitingReceiptCount, overdueApCount: ap._count,
                overdueApAmount: Number((ap._sum.totalAmount ?? new Prisma.Decimal(0)).minus(ap._sum.paidAmount ?? 0)),
            },
            recentOrders: recentPos.map((po) => ({
                id: po.id, poNumber: po.orderNumber, supplierName: po.supplier.name,
                status: po.status, totalAmount: po.totalAmount == null ? null : Number(po.totalAmount),
            })),
        };
    });
});
