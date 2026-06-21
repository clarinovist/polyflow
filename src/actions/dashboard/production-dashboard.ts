'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { ProductionStatus, MachineStatus } from '@prisma/client';
import { safeAction } from '@/lib/errors/errors';

export const getProductionDashboardStats = withTenant(
async function getProductionDashboardStats() {
    return safeAction(async () => {
        await requireAuth();

        // 1. Active Jobs
        const activeJobsCount = await prisma.productionOrder.count({
            where: {
                status: ProductionStatus.IN_PROGRESS
            }
        });

        // 2. Active Machines
        const activeMachinesCount = await prisma.machine.count({
            where: {
                status: MachineStatus.ACTIVE
            }
        });
        const totalMachines = await prisma.machine.count();

        // 3. Completed Today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const completedJobsCount = await prisma.productionOrder.count({
            where: {
                status: ProductionStatus.COMPLETED,
                updatedAt: { gte: todayStart, lte: todayEnd }
            }
        });

        // 4. Pending Release
        const draftJobsCount = await prisma.productionOrder.count({
            where: {
                status: { in: [ProductionStatus.DRAFT, ProductionStatus.WAITING_MATERIAL] }
            }
        });

        return {
            activeJobs: activeJobsCount,
            activeMachines: activeMachinesCount,
            totalMachines: totalMachines,
            completedJobs: completedJobsCount,
            draftJobs: draftJobsCount
        };
    });
}
);
