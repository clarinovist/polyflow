'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';

import { AnalyticsService } from '@/services/analytics/analytics-service';
import { DateRange } from '@/types/analytics';

export const getSalesDashboardStats = withTenant(
async function getSalesDashboardStats(dateRange?: DateRange) {
    return safeAction(async () => {
        // 1. Fetch Analytics Metrics (Revenue, Trend, Top Lists)
        const analytics = await AnalyticsService.getSalesMetrics(dateRange);

        // 2. Fetch Operational Metrics (Current Snapshots)
        // Active Orders (Not Completed or Cancelled) - Snapshot, not date bound
        const activeOrdersCount = await prisma.salesOrder.count({
            where: {
                status: {
                    notIn: ['DELIVERED', 'CANCELLED']
                }
            }
        });

        // Pending Deliveries - Snapshot
        const pendingDeliveriesCount = await prisma.deliveryOrder.count({
            where: {
                status: 'PENDING'
            }
        });

        // Active Customers - Snapshot (Total active base)
        const activeCustomersCount = await prisma.customer.count({
            where: {
                isActive: true
            }
        });

        // Recent 5 Orders - Snapshot
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
            ...analytics, // revenue, totalOrders, averageOrderValue, revenueTrend, topProducts, topCustomers
            activeOrders: activeOrdersCount,
            pendingDeliveries: pendingDeliveriesCount,
            activeCustomers: activeCustomersCount,
            recentOrders
        });
    });
}
);
