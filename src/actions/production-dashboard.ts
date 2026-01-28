'use server';

import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-checks';
import { ProductionStatus, MachineStatus } from '@prisma/client';

export async function getProductionDashboardStats() {
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

    // 3. Completed Today (Mock check for 'updatedAt' today and status 'COMPLETED' or 'in execution')
    // Doing a simple count of 'COMPLETED' orders for getting started
    const completedJobsCount = await prisma.productionOrder.count({
        where: {
            status: ProductionStatus.COMPLETED
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
}
