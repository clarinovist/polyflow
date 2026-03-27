'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';
import { MachineStatus } from '@prisma/client';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';

export const logMachineDowntime = withTenant(
async function logMachineDowntime(
    machineId: string,
    reason: string,
    createdById?: string
) {
    return safeAction(async () => {
        if (!machineId || !reason) {
            throw new BusinessRuleError('Machine ID and Reason are required');
        }

        try {
            await prisma.$transaction(async (tx) => {
                await tx.machineDowntime.create({
                    data: { machineId, reason, startTime: new Date(), createdById }
                });

                await tx.machine.update({
                    where: { id: machineId },
                    data: { status: MachineStatus.MAINTENANCE }
                });
            });

            revalidatePath('/kiosk');
            revalidatePath('/production');
            return null;
        } catch (error) {
            logger.error("Failed to log downtime", { error, module: 'ProductionActions' });
            throw new BusinessRuleError("Failed to log downtime. Please check system constraints.");
        }
    });
}
);
