'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { ProductionStatus, PurchaseOrderStatus } from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';

export const getPlanningDashboardStats = withTenant(
async function getPlanningDashboardStats() {
    return safeAction(async () => {
        await requireAuth();
        // 1. Production Stats
        const activeJobsCount = await prisma.productionOrder.count({
            where: {
                status: ProductionStatus.IN_PROGRESS
            }
        });

        const plannedJobsCount = await prisma.productionOrder.count({
            where: {
                status: { in: [ProductionStatus.DRAFT, ProductionStatus.RELEASED] }
            }
        });

        // 2. Machine Status
        const machineStats = await prisma.machine.groupBy({
            by: ['status'],
            _count: {
                status: true
            }
        });

        const activeMachines = machineStats.find(s => s.status === 'ACTIVE')?._count.status || 0;
        const maintenanceMachines = machineStats.find(s => s.status === 'MAINTENANCE')?._count.status || 0;
        const brokenMachines = machineStats.find(s => s.status === 'BROKEN')?._count.status || 0;
        const totalMachines = activeMachines + maintenanceMachines + brokenMachines;

        // 3. Procurement Health
        const openPosCount = await prisma.purchaseOrder.count({
            where: {
                status: { in: ['SENT', 'PARTIAL_RECEIVED'] as PurchaseOrderStatus[] }
            }
        });

        // 4. Critical Shortages (Approximate from MRP logic but faster)
        // We'll just count items that have critical stock alarm if possible, 
        // or reused a simplified version of determining shortage.
        // For dashboard speed, let's just check raw materials with quantity < minStock (assuming we had minStock, but we don't in schema yet maybe).
        // So we will stick to a simplified check: Count active PRE-PRODUCTION orders that haven't started.
        // Actually, let's count "DRAFT" orders as a proxy for "Planning load".

        // Let's rely on retrieving the top 5 recent production orders for the Timeline widget
        const recentOrders = await prisma.productionOrder.findMany({
            where: {
                status: { in: [ProductionStatus.RELEASED, ProductionStatus.IN_PROGRESS] }
            },
            orderBy: {
                plannedStartDate: 'desc'
            },
            take: 5,
            include: {
                bom: {
                    select: { name: true }
                },
                machine: {
                    select: { code: true }
                }
            }
        });

        return {
            activeJobsCount,
            plannedJobsCount,
            machineStats: {
                active: activeMachines,
                maintenance: maintenanceMachines,
                broken: brokenMachines,
                total: totalMachines
            },
            procurement: {
                openPos: openPosCount
            },
            recentOrders
        };
    });
}
);
