'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction } from '@/lib/errors/errors';

export type SalesPerformanceRow = {
  period: string;
  orderId: string;
  orderNumber: string;
  orderDate: Date;
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  totalAmount: number;
  status: string;
  invoiceStatus: string | null;
  salesPerson: string;
};

export type SalesPerformanceSummary = {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  avgOrderValue: number;
  topCustomers: { name: string; revenue: number; orders: number }[];
  topProducts: { name: string; revenue: number; quantity: number }[];
};

export const getSalesPerformanceReport = withTenant(
  async function getSalesPerformanceReport(filters?: {
    startDate?: Date;
    endDate?: Date;
    customerId?: string;
  }) {
    return safeAction(async () => {
      await requireAuth();

      const where: Record<string, unknown> = {
        status: { not: 'CANCELLED' },
      };

      if (filters?.startDate && filters?.endDate) {
        where.orderDate = {
          gte: filters.startDate,
          lte: filters.endDate,
        };
      }

      if (filters?.customerId) {
        where.customerId = filters.customerId;
      }

      const orders = await prisma.salesOrder.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          createdBy: { select: { name: true } },
          items: {
            include: {
              productVariant: {
                include: { product: { select: { name: true } } },
              },
            },
          },
          invoices: {
            select: { status: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { orderDate: 'desc' },
      });

      const rows: SalesPerformanceRow[] = orders.flatMap((order) =>
        order.items.map((item) => ({
          period: order.orderDate.toISOString().slice(0, 7),
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          customerName: order.customer?.name || '-',
          productName: item.productVariant?.product?.name || item.productVariant?.name || '-',
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.subtotal),
          totalAmount: Number(order.totalAmount || 0),
          status: order.status,
          invoiceStatus: order.invoices[0]?.status || null,
          salesPerson: order.createdBy?.name || '-',
        }))
      );

      // Summary
      const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
      const uniqueCustomers = new Set(orders.map((o) => o.customerId).filter(Boolean));

      // Top customers
      const customerMap = new Map<string, { name: string; revenue: number; orders: number }>();
      for (const order of orders) {
        const name = order.customer?.name || '-';
        const existing = customerMap.get(name) || { name, revenue: 0, orders: 0 };
        existing.revenue += Number(order.totalAmount || 0);
        existing.orders += 1;
        customerMap.set(name, existing);
      }
      const topCustomers = Array.from(customerMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Top products
      const productMap = new Map<string, { name: string; revenue: number; quantity: number }>();
      for (const order of orders) {
        for (const item of order.items) {
          const name = item.productVariant?.product?.name || item.productVariant?.name || '-';
          const existing = productMap.get(name) || { name, revenue: 0, quantity: 0 };
          existing.revenue += Number(item.subtotal);
          existing.quantity += Number(item.quantity);
          productMap.set(name, existing);
        }
      }
      const topProducts = Array.from(productMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const summary: SalesPerformanceSummary = {
        totalRevenue,
        totalOrders: orders.length,
        totalCustomers: uniqueCustomers.size,
        avgOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
        topCustomers,
        topProducts,
      };

      return { rows, summary };
    });
  }
);
