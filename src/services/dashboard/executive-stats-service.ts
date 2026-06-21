import { prisma } from '@/lib/core/prisma';
import { InvoiceStatus, ProductionStatus, PurchaseInvoiceStatus, PurchaseOrderStatus, SalesOrderStatus } from '@prisma/client';
import { endOfMonth, startOfMonth } from 'date-fns';

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
    revenueTrendChart: { month: string; revenue: number }[];
}

function decimalToNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
        return (value as { toNumber: () => number }).toNumber();
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
}

export class ExecutiveStatsService {
    static async getExecutiveStats(): Promise<ExecutiveStats> {
        const now = new Date();
        const startOfCurrentMonth = startOfMonth(now);
        const endOfCurrentMonth = endOfMonth(now);

        const startOfPreviousMonth = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const endOfPreviousMonth = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));

        const [
            revenueAggMTD,          // 0
            revenueAggPrevMonth,    // 1
            spendingAggMTD,         // 2
            spendingAggPrevMonth,   // 3
            salesOrdersMTD,         // 4
            pendingInvoicesCount,   // 5
            pendingPOsCount,        // 6
            activeProductionCount,  // 7
            productionOrdersMonth,  // 8
            delayedJobsCount,       // 9
            activeMachinesCount,    // 10
            runningMachinesOrders,  // 11
            downtimeRecords,        // 12
            scrapRecordsAgg,        // 13
            executionScrapAgg,      // 14
            executionOutputAgg,     // 15
            materialIssuesAgg,      // 16
            inventoryStatsAgg,      // 17
            overdueReceivablesAgg,  // 18
            overduePayablesAgg,     // 19
            invoicesDueThisWeekCount // 20
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
            // 8b. Delayed Jobs (past planned end date, not completed/cancelled)
            prisma.productionOrder.count({
                where: {
                    status: { in: [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS] },
                    plannedEndDate: { lt: now }
                }
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
        const mtdRevenue = decimalToNumber(revenueAggMTD._sum.credit) - decimalToNumber(revenueAggMTD._sum.debit);
        const prevRevenue = decimalToNumber(revenueAggPrevMonth._sum.credit) - decimalToNumber(revenueAggPrevMonth._sum.debit);
        const revenueTrend = prevRevenue > 0 ? ((mtdRevenue - prevRevenue) / prevRevenue) * 100 : 0;

        const mtdSpending = decimalToNumber(spendingAggMTD._sum.debit) - decimalToNumber(spendingAggMTD._sum.credit);
        const prevSpending = decimalToNumber(spendingAggPrevMonth._sum.debit) - decimalToNumber(spendingAggPrevMonth._sum.credit);
        const spendingTrend = prevSpending > 0 ? ((mtdSpending - prevSpending) / prevSpending) * 100 : 0;

        const activeOrders = salesOrdersMTD.filter(o => o.status !== SalesOrderStatus.DELIVERED).length;

        const completedJobs = productionOrdersMonth.filter(o => o.status === ProductionStatus.COMPLETED).length;
        const completionRate = productionOrdersMonth.length > 0 ? (completedJobs / productionOrdersMonth.length) * 100 : 0;

        const runningMachines = runningMachinesOrders.length;
        const totalDowntimeMs = downtimeRecords.reduce((sum, r) => sum + ((r.endTime?.getTime() || now.getTime()) - r.startTime.getTime()), 0);
        const downtimeHours = totalDowntimeMs / (1000 * 60 * 60);

        const totalScrapKg = decimalToNumber(scrapRecordsAgg._sum.quantity) + decimalToNumber(executionScrapAgg._sum.scrapQuantity);
        const totalOutput = decimalToNumber(executionOutputAgg._sum.quantityProduced);
        const totalInput = decimalToNumber(materialIssuesAgg._sum.quantity);
        const yieldRate = totalInput > 0 ? (totalOutput / totalInput) * 100 : 0;

        // Inventory Value Estimation (using weighted average cost, not selling price)
        const stockItems = await prisma.inventory.findMany({
            select: { quantity: true, averageCost: true, productVariant: { select: { standardCost: true, price: true } } }
        });
        const totalInventoryValue = stockItems.reduce((s, i) => {
            const unitCost = Number(i.averageCost || i.productVariant.standardCost || i.productVariant.price || 0);
            return s + (Number(i.quantity) * unitCost);
        }, 0);
        const lowStockCount = await prisma.inventory.count({ where: { quantity: { lt: 10 } } });

        const overdueReceivables = decimalToNumber(overdueReceivablesAgg._sum.totalAmount) - decimalToNumber(overdueReceivablesAgg._sum.paidAmount);
        const overduePayables = decimalToNumber(overduePayablesAgg._sum.totalAmount) - decimalToNumber(overduePayablesAgg._sum.paidAmount);

        // Production trend: completion rate this month vs last month
        const prevMonthOrders = await prisma.productionOrder.findMany({
            where: {
                createdAt: { gte: startOfPreviousMonth, lte: endOfPreviousMonth },
            },
            select: { status: true },
        });
        const prevCompleted = prevMonthOrders.filter(o => o.status === ProductionStatus.COMPLETED).length;
        const prevCompletionRate = prevMonthOrders.length > 0 ? (prevCompleted / prevMonthOrders.length) * 100 : 0;
        const productionTrend = prevCompletionRate > 0 ? ((completionRate - prevCompletionRate) / prevCompletionRate) * 100 : 0;

        // Inventory trend: requires historical inventory value snapshots for accurate calculation.
        // Currently not available — TODO: implement monthly inventory snapshot table.
        const inventoryTrend = 0;

        // Revenue trend: monthly revenue for current year (from GL)
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const monthlyRevenueRaw = await prisma.$queryRaw<{ month: string; revenue: number }[]>`
            SELECT
                TO_CHAR(je."entryDate", 'YYYY-MM') as month,
                COALESCE(SUM(jl.credit - jl.debit), 0) as revenue
            FROM "JournalLine" jl
            JOIN "JournalEntry" je ON je.id = jl."journalEntryId"
            JOIN "Account" a ON a.id = jl."accountId"
            WHERE a.code LIKE '4%'
                AND je.status = 'POSTED'
                AND je."entryDate" >= ${yearStart}
                AND je."entryDate" <= ${endOfCurrentMonth}
            GROUP BY TO_CHAR(je."entryDate", 'YYYY-MM')
            ORDER BY month
        `;
        const revenueTrendChart = monthlyRevenueRaw.map(r => ({
            month: r.month,
            revenue: Number(r.revenue)
        }));

        return {
            sales: { mtdRevenue, activeOrders, pendingInvoices: pendingInvoicesCount, trend: revenueTrend },
            purchasing: { mtdSpending, pendingPOs: pendingPOsCount, trend: spendingTrend },
            production: {
                activeJobs: activeProductionCount,
                delayedJobs: delayedJobsCount,
                completionRate,
                yieldRate,
                totalScrapKg,
                downtimeHours,
                runningMachines,
                totalMachines: activeMachinesCount,
                trend: productionTrend
            },
            inventory: {
                totalValue: totalInventoryValue,
                lowStockCount,
                totalItems: inventoryStatsAgg._count.id || 0,
                trend: inventoryTrend
            },
            cashflow: { overdueReceivables, overduePayables, invoicesDueThisWeek: invoicesDueThisWeekCount },
            revenueTrendChart
        };
    }
}
