'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { MachineStatus } from '@prisma/client';

export async function logMachineDowntime(
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
        revalidatePath('/dashboard/production');
        return { success: true };
    } catch (error) {
        console.error("Downtime Log Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to log downtime" };
    }
}
