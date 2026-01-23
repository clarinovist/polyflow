'use server';

import { prisma } from '@/lib/prisma';
import { ProductionStatus, SalesOrderStatus, PurchaseOrderStatus, InvoiceStatus, PurchaseInvoiceStatus } from '@prisma/client';
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
        // New Metrics
        yieldRate: number;      // % Good Output / Total Input
        totalScrapKg: number;   // ScrapRecord + Execution Scrap
        downtimeHours: number;  // MachineDowntime duration
        runningMachines: number; // Count of machines with IN_PROGRESS orders
        totalMachines: number;   // Count of ACTIVE machines
    };
    inventory: {
        totalValue: number;
        lowStockCount: number;
        totalItems: number;
    };
    cashflow: {
        overdueReceivables: number;
        overduePayables: number;
        invoicesDueThisWeek: number;
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
        // New Production Metrics
        activeMachinesCount,    // Total active machines
        runningMachinesCount,   // Machines with IN_PROGRESS orders
        downtimeRecords,        // Downtime in current month
        scrapRecords,           // Ad-hoc scrap
        executionScrap,         // ProductionExecution scrap
        executionOutput,        // ProductionExecution good output (for yield)
        materialIssues,         // Material Consumption (for yield)
        // Inventory
        inventoryStats,
        // Cashflow
        overdueReceivablesAgg,
        overduePayablesAgg,
        invoicesDueThisWeekCount
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

        // 7. Total Active Machines
        prisma.machine.count({
            where: { status: 'ACTIVE' }
        }),
        // 8. Running Machines (Orders IN_PROGRESS)
        // Approximation: Count machines typically assigned to IN_PROGRESS orders
        // A better way is counting distinct machineIds on IN_PROGRESS orders, but count() distinct is limited.
        // We'll use groupBy or distinct count workaround if needed, but for now lets check active orders with machineId
        prisma.productionOrder.findMany({
            where: {
                status: ProductionStatus.IN_PROGRESS,
                machineId: { not: null }
            },
            select: { machineId: true },
            distinct: ['machineId']
        }),

        // 9. Downtime Duration (Current Month)
        prisma.machineDowntime.findMany({
            where: {
                startTime: { gte: startOfCurrentMonth },
                // If checking overlap, logic is complex. Simplified: Starts in this month.
            },
            select: { startTime: true, endTime: true }
        }),

        // 10. Scrap Records (Ad-hoc)
        prisma.scrapRecord.aggregate({
            where: {
                recordedAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth }
            },
            _sum: { quantity: true }
        }),

        // 11. Execution Scrap (Inline)
        prisma.productionExecution.aggregate({
            where: {
                endTime: { gte: startOfCurrentMonth, lte: endOfCurrentMonth }
            },
            _sum: { scrapQuantity: true }
        }),

        // 12. Execution Output (For Yield)
        prisma.productionExecution.aggregate({
            where: {
                endTime: { gte: startOfCurrentMonth, lte: endOfCurrentMonth }
            },
            _sum: { quantityProduced: true }
        }),

        // 13. Material Issues (For Yield Input)
        prisma.materialIssue.aggregate({
            where: {
                issuedAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth }
            },
            _sum: { quantity: true }
        }),

        // 14. Inventory Stats
        prisma.productVariant.aggregate({
            _sum: { price: true }, // Approximation of value using price, ideally uses cost * stock
            _count: { id: true }
        }),

        // 15. Overdue Receivables (Sales Invoices)
        prisma.invoice.aggregate({
            where: {
                status: 'OVERDUE' as InvoiceStatus
            },
            _sum: { totalAmount: true, paidAmount: true } // Need to subtract paidAmount
        }),

        // 16. Overdue Payables (Purchase Invoices)
        prisma.purchaseInvoice.aggregate({
            where: {
                status: 'OVERDUE' as PurchaseInvoiceStatus // Using string literal or PurchaseInvoiceStatus enum if imported
            },
            _sum: { totalAmount: true, paidAmount: true }
        }),

        // 17. Invoices Due This Week (Sales & Purchasing combined or just Sales?)
        // Let's do Sales Invoices due in next 7 days
        prisma.invoice.count({
            where: {
                dueDate: {
                    gte: now,
                    lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
                },
                status: { not: InvoiceStatus.PAID }
            }
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

    // Running Machines
    const runningMachines = runningMachinesCount.length; // distinct machineIds

    // Downtime Hours
    const totalDowntimeMs = downtimeRecords.reduce((sum, record) => {
        const start = record.startTime.getTime();
        const end = record.endTime ? record.endTime.getTime() : now.getTime();
        return sum + (end - start);
    }, 0);
    const downtimeHours = totalDowntimeMs / (1000 * 60 * 60);

    // Scrap (kg)
    const adhocScrap = scrapRecords._sum.quantity?.toNumber() || 0;
    const inlineScrap = executionScrap._sum.scrapQuantity?.toNumber() || 0;
    const totalScrapKg = adhocScrap + inlineScrap;

    // Yield Rate
    const totalOutput = executionOutput._sum.quantityProduced?.toNumber() || 0;
    const totalInput = materialIssues._sum.quantity?.toNumber() || 0;
    // Yield = Output / Input. Note: This is an approximation as Input might be for WIP not yet Output.
    // For specific plastic batch yield, we usually compare Output vs Input per Order.
    // Aggregate Level: Good enough for high level trend.
    const yieldRate = totalInput > 0 ? (totalOutput / totalInput) * 100 : 0;

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


    // --- Calculate Cashflow Metrics ---
    const overdueReceivables = (overdueReceivablesAgg._sum?.totalAmount?.toNumber() || 0) - (overdueReceivablesAgg._sum?.paidAmount?.toNumber() || 0);
    const overduePayables = (overduePayablesAgg._sum?.totalAmount?.toNumber() || 0) - (overduePayablesAgg._sum?.paidAmount?.toNumber() || 0);

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
            completionRate,
            yieldRate,
            totalScrapKg,
            downtimeHours,
            runningMachines,
            totalMachines: activeMachinesCount
        },
        inventory: {
            totalValue: totalInventoryValue,
            lowStockCount,
            totalItems: inventoryStats._count.id || 0
        },
        cashflow: {
            overdueReceivables,
            overduePayables,
            invoicesDueThisWeek: invoicesDueThisWeekCount
        }
    };
}
