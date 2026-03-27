import { prisma } from '@/lib/core/prisma';
import { ProductionStatus } from '@prisma/client';

export interface FOHAllocationRow {
    orderId: string;
    orderNumber: string;
    actualQuantity: number;
    allocationRatio: number;
    allocatedOverhead: number;
}

export interface FOHAllocationResult {
    totalOverhead: number;
    totalQuantity: number;
    allocations: FOHAllocationRow[];
}

export class FOHAllocationService {
    /**
     * Calculate FOH Allocation based on actual production quantity
     */
    static async calculateAllocation(
        year: number, 
        month: number, 
        overheadAccountId: string
    ): Promise<FOHAllocationResult> {
        const firstDay = new Date(year, month - 1, 1);
        const nextMonthDay = new Date(year, month, 1);

        // 1. Calculate Total Overhead Cost for the month
        const overheadLines = await prisma.journalLine.findMany({
            where: {
                accountId: overheadAccountId,
                journalEntry: {
                    status: 'POSTED',
                    entryDate: {
                        gte: firstDay,
                        lt: nextMonthDay
                    }
                }
            }
        });

        let totalOverhead = 0;
        for (const line of overheadLines) {
            totalOverhead += (line.debit ? line.debit.toNumber() : 0) - (line.credit ? line.credit.toNumber() : 0);
        }

        // 2. Find all Production Orders completed in the month
        const productionOrders = await prisma.productionOrder.findMany({
            where: {
                status: ProductionStatus.COMPLETED,
                actualEndDate: {
                    gte: firstDay,
                    lt: nextMonthDay
                }
            }
        });

        let totalQuantity = 0;
        for (const order of productionOrders) {
            totalQuantity += order.actualQuantity ? order.actualQuantity.toNumber() : 0;
        }

        // 3. Allocate
        const allocations: FOHAllocationRow[] = [];
        for (const order of productionOrders) {
            const qty = order.actualQuantity ? order.actualQuantity.toNumber() : 0;
            const ratio = totalQuantity > 0 ? (qty / totalQuantity) : 0;
            const allocated = totalOverhead * ratio;

            if (qty > 0) {
                allocations.push({
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    actualQuantity: qty,
                    allocationRatio: ratio,
                    allocatedOverhead: allocated
                });
            }
        }

        return {
            totalOverhead,
            totalQuantity,
            allocations: allocations.sort((a, b) => b.allocatedOverhead - a.allocatedOverhead)
        };
    }
}
