'use server';

import { prisma } from '@/lib/prisma';
import { startOfMonth, endOfMonth } from 'date-fns';
import { serializeData } from '@/lib/utils';

export async function getSalesDashboardStats() {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);

    // 1. Revenue (Total Invoiced Amount this month)
    const currentMonthRevenue = await prisma.invoice.aggregate({
        _sum: {
            totalAmount: true
        },
        where: {
            invoiceDate: {
                gte: startOfCurrentMonth,
                lte: endOfCurrentMonth
            },
            status: {
                not: 'CANCELLED'
            }
        }
    });
    const revenue = Number(currentMonthRevenue._sum?.totalAmount || 0);

    // 2. Active Orders (Not Completed or Cancelled)
    const activeOrdersCount = await prisma.salesOrder.count({
        where: {
            status: {
                notIn: ['DELIVERED', 'CANCELLED']
            }
        }
    });

    // 3. Pending Deliveries
    const pendingDeliveriesCount = await prisma.deliveryOrder.count({
        where: {
            status: 'PENDING'
        }
    });

    // 4. Active Customers
    const activeCustomersCount = await prisma.customer.count({
        where: {
            isActive: true
        }
    });

    // Recent 5 Orders
    const recentOrders = await prisma.salesOrder.findMany({
        take: 5,
        orderBy: {
            createdAt: 'desc'
        },
        include: {
            customer: {
                select: {
                    name: true
                }
            },
            _count: {
                select: {
                    items: true
                }
            },
            sourceLocation: {
                select: {
                    name: true
                }
            }
        }
    });

    return serializeData({
        revenue,
        activeOrders: activeOrdersCount,
        pendingDeliveries: pendingDeliveriesCount,
        activeCustomers: activeCustomersCount,
        recentOrders
    });
}
