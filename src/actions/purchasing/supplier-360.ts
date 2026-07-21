'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction } from '@/lib/errors/errors';

export const listPurchaseOrdersBySupplier = withTenant(async function listPurchaseOrdersBySupplier(supplierId: string) {
  return safeAction(async () => {
    await requireAuth();
    return prisma.purchaseOrder.findMany({
      where: { supplierId },
      orderBy: { orderDate: 'desc' },
      include: {
        items: { select: { receivedQty: true, quantity: true } },
      },
    });
  });
});

export const listPurchaseReturnsBySupplier = withTenant(async function listPurchaseReturnsBySupplier(supplierId: string) {
  return safeAction(async () => {
    await requireAuth();
    return prisma.purchaseReturn.findMany({
      where: { supplierId },
      orderBy: { returnDate: 'desc' },
    });
  });
});

export const listPurchaseInvoicesBySupplier = withTenant(async function listPurchaseInvoicesBySupplier(supplierId: string) {
  return safeAction(async () => {
    await requireAuth();
    const pos = await prisma.purchaseOrder.findMany({
      where: { supplierId },
      select: { id: true },
    });
    const poIds = pos.map((p) => p.id);
    if (poIds.length === 0) return { invoices: [], payments: [] };

    const invoices = await prisma.purchaseInvoice.findMany({
      where: { purchaseOrderId: { in: poIds } },
      orderBy: { invoiceDate: 'desc' },
      include: {
        purchaseOrder: { select: { orderNumber: true } },
        purchasePayments: { orderBy: { paymentDate: 'desc' } },
      },
    });

    return { invoices, payments: [] as never[] };
  });
});

export const getSupplierPerformanceStats = withTenant(async function getSupplierPerformanceStats(supplierId: string) {
  return safeAction(async () => {
    await requireAuth();
    const recentOrders = await prisma.purchaseOrder.findMany({
      where: { supplierId, status: { in: ['RECEIVED', 'PARTIAL_RECEIVED'] as never[] } },
      orderBy: { orderDate: 'desc' },
      take: 20,
      select: {
        orderDate: true,
        expectedDate: true,
        createdAt: true,
        goodsReceipts: { select: { receivedDate: true } },
      },
    });

    const withReceipt = recentOrders.filter((o) => o.goodsReceipts.length > 0);
    let totalLeadDays = 0;
    let onTimeCount = 0;
    for (const o of withReceipt) {
      const receiptDate = o.goodsReceipts[0]?.receivedDate;
      if (!receiptDate) continue;
      const diff = Math.max(0, Math.ceil((new Date(receiptDate).getTime() - new Date(o.orderDate).getTime()) / (1000 * 60 * 60 * 24)));
      totalLeadDays += diff;
      if (o.expectedDate) {
        if (new Date(receiptDate) <= new Date(o.expectedDate)) onTimeCount += 1;
      }
    }

    const avgLeadDays = withReceipt.length > 0 ? Math.round(totalLeadDays / withReceipt.length) : null;
    const onTimeRate = withReceipt.length > 0 ? Math.round((onTimeCount / withReceipt.length) * 100) : null;

    const returnsCount = await prisma.purchaseReturn.count({ where: { supplierId } });

    return {
      totalOrders: recentOrders.length,
      withReceipt: withReceipt.length,
      avgLeadDays,
      onTimeRate,
      returnsCount,
    };
  });
});

export const getSupplierSpendingAnalytics = withTenant(async function getSupplierSpendingAnalytics(supplierId: string) {
  return safeAction(async () => {
    await requireAuth();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const orders = await prisma.purchaseOrder.findMany({
      where: {
        supplierId,
        orderDate: { gte: sixMonthsAgo },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      },
      select: { orderDate: true, totalAmount: true },
      orderBy: { orderDate: 'asc' },
    });

    const monthly = new Map<string, { month: string; total: number; count: number }>();
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(d);
      monthly.set(key, { month: label, total: 0, count: 0 });
    }

    for (const o of orders) {
      const key = `${o.orderDate.getFullYear()}-${String(o.orderDate.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthly.get(key);
      if (entry) {
        entry.total += Number(o.totalAmount ?? 0);
        entry.count += 1;
      }
    }

    return Array.from(monthly.values());
  });
});
