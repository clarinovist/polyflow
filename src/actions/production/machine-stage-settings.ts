'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
    safeAction,
    AuthorizationError,
    ValidationError,
} from '@/lib/errors/errors';
import { isTenantAdmin } from '@/lib/auth/roles';
import {
    MACHINE_STAGE_MAP_SETTING_KEY,
    parseMachineStageMap,
    resolveMachineStageMap,
} from '@/lib/production/machine-compatibility';
import { logger } from '@/lib/config/logger';

async function requireAdminId(): Promise<string> {
    const session = await auth();
    if (!session?.user || !isTenantAdmin(session.user)) {
        throw new AuthorizationError(
            'Hanya admin yang dapat mengubah setup stage mesin.',
        );
    }
    const id = session.user.id;
    if (!id) throw new AuthorizationError('Sesi tidak valid.');
    return id;
}

const stageMapSchema = z
    .object({
        MIXING: z.array(z.enum(['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'])),
        EXTRUSION: z.array(z.enum(['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'])),
        PACKING: z.array(z.enum(['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'])),
        REWORK: z.array(z.enum(['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'])),
        STANDARD: z.array(z.enum(['MIXER', 'EXTRUDER', 'REWINDER', 'PACKER', 'GRANULATOR'])),
    })
    .strict();

export type MachineStageMapSettings = z.infer<typeof stageMapSchema>;

export const getMachineStageSettings = withTenant(
    async function getMachineStageSettings() {
        return safeAction(async () => {
            await requireAdminId();
            const row = await prisma.appSetting.findUnique({
                where: { key: MACHINE_STAGE_MAP_SETTING_KEY },
                select: { value: true },
            });
            const parsed = parseMachineStageMap(row?.value);
            return resolveMachineStageMap(parsed);
        });
    },
);

export const saveMachineStageSettings = withTenant(
    async function saveMachineStageSettings(input: MachineStageMapSettings) {
        return safeAction(async () => {
            const adminId = await requireAdminId();
            const parsed = stageMapSchema.safeParse(input);
            if (!parsed.success) {
                throw new ValidationError(
                    'Format setup stage tidak valid. Pilih minimal satu tipe mesin per stage.',
                );
            }
            // Ensure every stage has at least one type; empty list rejected above via schema
            const value = JSON.stringify(parsed.data);
            try {
                await prisma.appSetting.upsert({
                    where: { key: MACHINE_STAGE_MAP_SETTING_KEY },
                    create: {
                        key: MACHINE_STAGE_MAP_SETTING_KEY,
                        value,
                        updatedBy: adminId,
                    },
                    update: { value, updatedBy: adminId },
                });
                revalidatePath('/dashboard/machines');
                revalidatePath('/production/machines');
                return resolveMachineStageMap(parsed.data);
            } catch (error) {
                logger.error('Failed to save machine stage settings', {
                    error,
                    module: 'MachineStageSettings',
                });
                throw new ValidationError(
                    'Gagal menyimpan setup stage. Silakan coba lagi.',
                );
            }
        });
    },
);
