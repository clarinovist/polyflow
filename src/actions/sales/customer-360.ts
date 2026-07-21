'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction } from '@/lib/errors/errors';

export const listCustomerInvoices = withTenant(async function listCustomerInvoices(customerId: string) {
  return safeAction(async () => {
    await requireAuth();
    const salesOrders = await prisma.salesOrder.findMany({
      where: { customerId },
      select: { id: true },
    });
    const orderIds = salesOrders.map((o) => o.id);
    if (orderIds.length === 0) return [];
    return prisma.invoice.findMany({
      where: { salesOrderId: { in: orderIds } },
      orderBy: { invoiceDate: 'desc' },
      include: {
        salesOrder: { select: { orderNumber: true, customerId: true } },
      },
    });
  });
});

export const listCustomerReturns = withTenant(async function listCustomerReturns(customerId: string) {
  return safeAction(async () => {
    await requireAuth();
    return prisma.salesReturn.findMany({
      where: { customerId },
      orderBy: { returnDate: 'desc' },
    });
  });
});

export const listCustomerDeliveries = withTenant(async function listCustomerDeliveries(customerId: string) {
  return safeAction(async () => {
    await requireAuth();
    return prisma.deliveryOrder.findMany({
      where: { salesOrder: { customerId } },
      orderBy: { deliveryDate: 'desc' },
      include: {
        items: { select: { id: true } },
      },
    });
  });
});

export const listCustomerQuotations = withTenant(async function listCustomerQuotations(customerId: string) {
  return safeAction(async () => {
    await requireAuth();
    return prisma.salesQuotation.findMany({
      where: { customerId },
      orderBy: { quotationDate: 'desc' },
    });
  });
});

export const listCustomerVisits = withTenant(async function listCustomerVisits(customerId: string) {
  return safeAction(async () => {
    await requireAuth();
    return prisma.salesVisit.findMany({
      where: { customerId },
      orderBy: { checkInTime: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
      },
    });
  });
});

export const getCustomerSalesAnalytics = withTenant(async function getCustomerSalesAnalytics(customerId: string) {
  return safeAction(async () => {
    await requireAuth();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const orders = await prisma.salesOrder.findMany({
      where: {
        customerId,
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
