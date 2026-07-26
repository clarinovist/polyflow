'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';
import { MachineStatus } from '@prisma/client';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';

/**
 * Kiosk variant of downtime logging: the shop-floor terminal runs without a
 * NextAuth session, so `createdById` (the operator) stands in as attribution.
 *
 * The session-backed variant lives in `production-downtime.ts` and is what the
 * barrel re-exports; this one exists for the kiosk and is called by
 * `DowntimeDialog`.
 */
export const logMachineDowntime = withTenant(async function logMachineDowntime(
    machineId: string,
    reason: string,
    createdById?: string,
) {
    return safeAction(async () => {
        if (!machineId || !reason) {
            throw new BusinessRuleError('Machine ID and Reason are required');
        }

        // Same guard as the execution actions: a session, or an operator to
        // attribute the record to. Never both missing — this writes a row and
        // flips the machine to MAINTENANCE.
        try {
            await requireAuth();
        } catch {
            if (!createdById) {
                throw new BusinessRuleError(
                    'Autentikasi diperlukan atau ID operator harus diisi',
                );
            }
        }

        try {
            await prisma.$transaction(async (tx) => {
                await tx.machineDowntime.create({
                    data: {
                        machineId,
                        reason,
                        startTime: new Date(),
                        createdById,
                    },
                });

                await tx.machine.update({
                    where: { id: machineId },
                    data: { status: MachineStatus.MAINTENANCE },
                });
            });

            revalidatePath('/kiosk');
            revalidatePath('/production');
            return null;
        } catch (error) {
            logger.error('Failed to log downtime', {
                error,
                module: 'ProductionActions',
            });
            throw new BusinessRuleError(
                'Gagal mencatat downtime. Periksa batasan sistem.',
            );
        }
    });
});
