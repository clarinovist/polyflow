'use server';

import { prisma } from '@/lib/prisma';
import { ProductionStatus, SalesOrderStatus, PurchaseOrderStatus, InvoiceStatus } from '@prisma/client';
import { startOfMonth, endOfMonth } from 'date-fns';

export interface ExecutiveStats {
    sales: {
        mtdRevenue: number;
        activeOrders: number;
        pendingInvoices: number;
    };
    purchasing: {
        mtdSpending: number;
        pendingPOs: number;
    };
    production: {
        activeJobs: number;
        delayedJobs: number; // Placeholder logic for now, or could be jobs past due date
        completionRate: number; // Completed / Total this month
    };
    inventory: {
        totalValue: number;
        lowStockCount: number;
        totalItems: number;
    };
}

export async function getExecutiveStats(): Promise<ExecutiveStats> {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);

    const [
        // Sales
        salesOrders,
        pendingInvoices,
        // Purchasing
        purchaseOrders,
        pendingPOs,
        // Production
        activeProductionOrders,
        completedProductionOrdersMonth,
        // Inventory
        inventoryStats
    ] = await prisma.$transaction([
        // 1. Sales Revenue MTD (Confirmed Orders)
        prisma.salesOrder.findMany({
            where: {
                createdAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
                status: { not: SalesOrderStatus.CANCELLED }
            },
            select: { totalAmount: true, status: true }
        }),
        // 2. Pending Sales Invoices (Count) - Model is "Invoice"
        prisma.invoice.count({
            where: { status: InvoiceStatus.UNPAID }
        }),

        // 3. Purchasing Spending MTD
        prisma.purchaseOrder.findMany({
            where: {
                createdAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
                status: { not: PurchaseOrderStatus.CANCELLED }
            },
            select: { totalAmount: true }
        }),
        // 4. Pending POs
        prisma.purchaseOrder.count({
            where: { status: { in: [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SENT] } }
        }),

        // 5. Active Production Jobs
        prisma.productionOrder.count({
            where: { status: { in: [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS] } }
        }),
        // 6. Production Completion Rate Source (Total this month)
        prisma.productionOrder.findMany({
            where: {
                createdAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth }
            },
            select: { status: true }
        }),

        // 7. Inventory Stats
        prisma.productVariant.aggregate({
            _sum: { price: true }, // Approximation of value using price, ideally uses cost * stock
            _count: { id: true }
        })
    ]);

    // --- Calculate Sales Metrics ---
    // Note: totalAmount is Decimal, need to toNumber()
    const mtdRevenue = salesOrders.reduce((sum: number, order: { totalAmount: unknown }) => sum + Number(order.totalAmount || 0), 0);
    // SalesOrderStatus doesn't have COMPLETED, using DELIVERED as proxy for completed cycle
    const activeSalesOrders = salesOrders.filter((o: { status: SalesOrderStatus }) => o.status !== SalesOrderStatus.DELIVERED && o.status !== SalesOrderStatus.CANCELLED).length;

    // --- Calculate Purchasing Metrics ---
    const mtdSpending = purchaseOrders.reduce((sum: number, order: { totalAmount: unknown }) => sum + Number(order.totalAmount || 0), 0);

    // --- Calculate Production Metrics ---
    const totalJobsMonth = completedProductionOrdersMonth.length;
    const completedJobsMonth = completedProductionOrdersMonth.filter((o: { status: ProductionStatus }) => o.status === ProductionStatus.COMPLETED).length;
    const completionRate = totalJobsMonth > 0 ? (completedJobsMonth / totalJobsMonth) * 100 : 0;

    // --- Calculate Inventory Metrics ---
    // Accurate Inventory Value requires iterating all stock items * cost.
    // For performance, we'll do a separate aggregate query or simplified estimation.
    // Let's do a slightly better query for value: sum(quantity * cost)
    // But since we can't easily do that in one prisma aggregate without raw query, let's fetch inventory items.
    // Optimization: Fetch only quantity and cost fields.
    const stockItems = await prisma.inventory.findMany({
        select: { quantity: true, productVariant: { select: { price: true } } } // using price as proxy for value if cost missing
    });

    const totalInventoryValue = stockItems.reduce((sum: number, item: { quantity: unknown; productVariant: { price: unknown } }) => {
        return sum + (Number(item.quantity) * Number(item.productVariant.price || 0));
    }, 0);

    // Low stock count (already implemented logic elsewhere, but let's re-count simply)
    // Assuming low stock is < 10 for now, or need to fetch reorder points.
    // Let's use the existing logic or simple count for speed.
    // To match previous dashboard, we need reorderPoint from ProductVariant.
    const lowStockCount = await prisma.inventory.count({
        where: {
            quantity: { lt: 10 } // Simplified threshold or fetch from variant
        }
    });


    return {
        sales: {
            mtdRevenue,
            activeOrders: activeSalesOrders,
            pendingInvoices
        },
        purchasing: {
            mtdSpending,
            pendingPOs
        },
        production: {
            activeJobs: activeProductionOrders,
            delayedJobs: 0, // Placeholder
            completionRate
        },
        inventory: {
            totalValue: totalInventoryValue,
            lowStockCount,
            totalItems: inventoryStats._count.id || 0
        }
    };
}
