'use server';

import { prisma } from '@/lib/prisma';
import { ProductionStatus, SalesOrderStatus, PurchaseOrderStatus, InvoiceStatus, PurchaseInvoiceStatus } from '@prisma/client';
import { startOfMonth, endOfMonth } from 'date-fns';

export interface ExecutiveStats {
    sales: {
        mtdRevenue: number;
        activeOrders: number;
        pendingInvoices: number;
        trend?: number;
    };
    purchasing: {
        mtdSpending: number;
        pendingPOs: number;
        trend?: number;
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
        trend?: number;
    };
    inventory: {
        totalValue: number;
        lowStockCount: number;
        totalItems: number;
        trend?: number;
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

    const startOfPreviousMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const endOfPreviousMonth = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const [
        revenueAggMTD,          // 0
        revenueAggPrevMonth,    // 1
        spendingAggMTD,         // 2: NEW - Spending MTD (GL)
        spendingAggPrevMonth,   // 3: NEW - Spending Prev Month (GL)
        salesOrdersMTD,         // 4
        pendingInvoicesCount,   // 5
        pendingPOsCount,        // 6
        activeProductionCount,  // 7
        productionOrdersMonth,  // 8
        activeMachinesCount,    // 9
        runningMachinesOrders,  // 10
        downtimeRecords,        // 11
        scrapRecordsAgg,        // 12
        executionScrapAgg,      // 13
        executionOutputAgg,     // 14
        materialIssuesAgg,      // 15
        inventoryStatsAgg,      // 16
        overdueReceivablesAgg,  // 17
        overduePayablesAgg,     // 18
        invoicesDueThisWeekCount // 19
    ] = await prisma.$transaction([
        // 0. Revenue MTD (GL: 4xxxx)
        prisma.journalLine.aggregate({
            where: {
                account: { code: { startsWith: '4' } },
                journalEntry: {
                    status: 'POSTED',
                    entryDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth }
                }
            },
            _sum: { credit: true, debit: true }
        }),
        // 1. Revenue Previous Month (GL: 4xxxx)
        prisma.journalLine.aggregate({
            where: {
                account: { code: { startsWith: '4' } },
                journalEntry: {
                    status: 'POSTED',
                    entryDate: { gte: startOfPreviousMonth, lte: endOfPreviousMonth }
                }
            },
            _sum: { credit: true, debit: true }
        }),
        // 2. Spending MTD (GL: 5xxxx, 6xxxx)
        prisma.journalLine.aggregate({
            where: {
                account: {
                    OR: [
                        { code: { startsWith: '5' } },
                        { code: { startsWith: '6' } }
                    ]
                },
                journalEntry: {
                    status: 'POSTED',
                    entryDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth }
                }
            },
            _sum: { credit: true, debit: true }
        }),
        // 3. Spending Previous Month (GL: 5xxxx, 6xxxx)
        prisma.journalLine.aggregate({
            where: {
                account: {
                    OR: [
                        { code: { startsWith: '5' } },
                        { code: { startsWith: '6' } }
                    ]
                },
                journalEntry: {
                    status: 'POSTED',
                    entryDate: { gte: startOfPreviousMonth, lte: endOfPreviousMonth }
                }
            },
            _sum: { credit: true, debit: true }
        }),
        // 4. Sales Orders MTD (for active count)
        prisma.salesOrder.findMany({
            where: {
                orderDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
                status: { notIn: [SalesOrderStatus.CANCELLED, SalesOrderStatus.DRAFT] }
            },
            select: { status: true }
        }),
        // 5. Pending Sales Invoices
        prisma.invoice.count({
            where: { status: InvoiceStatus.UNPAID }
        }),
        // 6. Pending POs
        prisma.purchaseOrder.count({
            where: { status: { in: [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SENT] } }
        }),
        // 7. Active Production Jobs
        prisma.productionOrder.count({
            where: { status: { in: [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS] } }
        }),
        // 8. Production Orders this month (for completion rate)
        prisma.productionOrder.findMany({
            where: { createdAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } },
            select: { status: true }
        }),
        // 9. Active Machines
        prisma.machine.count({ where: { status: 'ACTIVE' } }),
        // 10. Running Machines orders
        prisma.productionOrder.findMany({
            where: { status: ProductionStatus.IN_PROGRESS, machineId: { not: null } },
            select: { machineId: true },
            distinct: ['machineId']
        }),
        // 11. Downtime (Current Month)
        prisma.machineDowntime.findMany({
            where: { startTime: { gte: startOfCurrentMonth } },
            select: { startTime: true, endTime: true }
        }),
        // 12. Scrap Ad-hoc
        prisma.scrapRecord.aggregate({
            where: { recordedAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } },
            _sum: { quantity: true }
        }),
        // 13. Execution Scrap
        prisma.productionExecution.aggregate({
            where: { endTime: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } },
            _sum: { scrapQuantity: true }
        }),
        // 14. Execution Output
        prisma.productionExecution.aggregate({
            where: { endTime: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } },
            _sum: { quantityProduced: true }
        }),
        // 15. Material Issues
        prisma.materialIssue.aggregate({
            where: { issuedAt: { gte: startOfCurrentMonth, lte: endOfCurrentMonth } },
            _sum: { quantity: true }
        }),
        // 16. Inventory Stats
        prisma.productVariant.aggregate({
            _sum: { price: true },
            _count: { id: true }
        }),
        // 17. Overdue Receivables
        prisma.invoice.aggregate({
            where: { status: 'OVERDUE' as InvoiceStatus },
            _sum: { totalAmount: true, paidAmount: true }
        }),
        // 18. Overdue Payables
        prisma.purchaseInvoice.aggregate({
            where: { status: 'OVERDUE' as PurchaseInvoiceStatus },
            _sum: { totalAmount: true, paidAmount: true }
        }),
        // 19. Invoices Due This Week
        prisma.invoice.count({
            where: {
                dueDate: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
                status: { not: InvoiceStatus.PAID }
            }
        })
    ]);

    // --- Calculations ---
    const mtdRevenue = (Number(revenueAggMTD._sum.credit) || 0) - (Number(revenueAggMTD._sum.debit) || 0);
    const prevRevenue = (Number(revenueAggPrevMonth._sum.credit) || 0) - (Number(revenueAggPrevMonth._sum.debit) || 0);
    const revenueTrend = prevRevenue > 0 ? ((mtdRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    const mtdSpending = (Number(spendingAggMTD._sum.debit) || 0) - (Number(spendingAggMTD._sum.credit) || 0);
    const prevSpending = (Number(spendingAggPrevMonth._sum.debit) || 0) - (Number(spendingAggPrevMonth._sum.credit) || 0);
    const spendingTrend = prevSpending > 0 ? ((mtdSpending - prevSpending) / prevSpending) * 100 : 0;

    const activeOrders = salesOrdersMTD.filter(o => o.status !== SalesOrderStatus.DELIVERED).length;

    const completedJobs = productionOrdersMonth.filter(o => o.status === ProductionStatus.COMPLETED).length;
    const completionRate = productionOrdersMonth.length > 0 ? (completedJobs / productionOrdersMonth.length) * 100 : 0;

    const runningMachines = runningMachinesOrders.length;
    const totalDowntimeMs = downtimeRecords.reduce((sum, r) => sum + ((r.endTime?.getTime() || now.getTime()) - r.startTime.getTime()), 0);
    const downtimeHours = totalDowntimeMs / (1000 * 60 * 60);

    const totalScrapKg = (scrapRecordsAgg._sum.quantity?.toNumber() || 0) + (executionScrapAgg._sum.scrapQuantity?.toNumber() || 0);
    const totalOutput = executionOutputAgg._sum.quantityProduced?.toNumber() || 0;
    const totalInput = materialIssuesAgg._sum.quantity?.toNumber() || 0;
    const yieldRate = totalInput > 0 ? (totalOutput / totalInput) * 100 : 0;

    // Inventory Value Estimation
    const stockItems = await prisma.inventory.findMany({
        select: { quantity: true, productVariant: { select: { price: true } } }
    });
    const totalInventoryValue = stockItems.reduce((s, i) => s + (Number(i.quantity) * Number(i.productVariant.price || 0)), 0);
    const lowStockCount = await prisma.inventory.count({ where: { quantity: { lt: 10 } } });

    const overdueReceivables = (overdueReceivablesAgg._sum.totalAmount?.toNumber() || 0) - (overdueReceivablesAgg._sum.paidAmount?.toNumber() || 0);
    const overduePayables = (overduePayablesAgg._sum.totalAmount?.toNumber() || 0) - (overduePayablesAgg._sum.paidAmount?.toNumber() || 0);

    return {
        sales: { mtdRevenue, activeOrders, pendingInvoices: pendingInvoicesCount, trend: revenueTrend },
        purchasing: { mtdSpending, pendingPOs: pendingPOsCount, trend: spendingTrend },
        production: {
            activeJobs: activeProductionCount,
            delayedJobs: 0,
            completionRate,
            yieldRate,
            totalScrapKg,
            downtimeHours,
            runningMachines,
            totalMachines: activeMachinesCount,
            trend: 0
        },
        inventory: {
            totalValue: totalInventoryValue,
            lowStockCount,
            totalItems: inventoryStatsAgg._count.id || 0,
            trend: 0
        },
        cashflow: { overdueReceivables, overduePayables, invoicesDueThisWeek: invoicesDueThisWeekCount }
    };
}
