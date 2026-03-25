'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';
import { MachineStatus } from '@prisma/client';
import { logger } from '@/lib/config/logger';

export const logMachineDowntime = withTenant(
async function logMachineDowntime(
    machineId: string,
    reason: string,
    createdById?: string
) {
    if (!machineId || !reason) {
        return { success: false, error: 'Machine ID and Reason are required' };
    }

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Create Log
            await tx.machineDowntime.create({
                data: {
                    machineId,
                    reason,
                    startTime: new Date(),
                    createdById
                }
            });

            // 2. Update Machine Status
            await tx.machine.update({
                where: { id: machineId },
                data: { status: MachineStatus.MAINTENANCE } // Or BROKEN, depending on severity. Default to MAINTENANCE.
            });
        });

        revalidatePath('/kiosk');
        revalidatePath('/production');
        return { success: true };
    } catch (error) {
        logger.error("Failed to log downtime", { error, module: 'ProductionActions' });
        return { success: false, error: "Failed to log downtime. Please check system constraints." };
    }
}
);
