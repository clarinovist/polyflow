'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { MachineType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { logger } from '@/lib/config/logger';
import { requireHrdApprover, requireHrdFinance } from '@/lib/auth/hrd-access';
import { logActivity } from '@/lib/tools/audit';

const ALL_MACHINE_TYPES = Object.values(MachineType);

type RateStatus = 'ACTIVE' | 'INACTIVE';

/** Upsert tarif + audit (rate lama -> baru) dalam satu transaksi. */
async function upsertRateWithAudit(
    userId: string,
    machineType: MachineType,
    ratePerKg: number,
    status: RateStatus,
) {
    return prisma.$transaction(async (tx) => {
        const before = await tx.processPieceRate.findUnique({
            where: { machineType },
        });
        const saved = await tx.processPieceRate.upsert({
            where: { machineType },
            create: { machineType, ratePerKg, status },
            update: { ratePerKg, status },
        });
        const oldRate = before ? Number(before.ratePerKg) : null;
        await logActivity({
            userId,
            action: 'PIECE_RATE_UPSERTED',
            entityType: 'ProcessPieceRate',
            entityId: saved.id,
            details: `Tarif borongan ${machineType}: ${oldRate ?? 'baru'} -> ${ratePerKg} /kg`,
            changes: {
                machineType,
                ratePerKg: { from: oldRate, to: ratePerKg },
                status: { from: before?.status ?? null, to: status },
            },
            tx,
        });
        return saved;
    });
}

export const listProcessPieceRates = withTenant(
    async function listProcessPieceRates() {
        return safeAction(async () => {
            await requireHrdFinance();
            const rows = await prisma.processPieceRate.findMany({
                orderBy: { machineType: 'asc' },
            });
            const byType = new Map(rows.map((r) => [r.machineType, r]));
            return ALL_MACHINE_TYPES.map((machineType) => {
                const row = byType.get(machineType);
                return {
                    id: row?.id ?? null,
                    machineType,
                    ratePerKg: row ? Number(row.ratePerKg) : 0,
                    status: row?.status ?? 'INACTIVE',
                };
            });
        });
    },
);

export const upsertProcessPieceRate = withTenant(
    async function upsertProcessPieceRate(input: {
        machineType: MachineType;
        ratePerKg: number;
        status?: RateStatus;
    }) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            try {
                if (!ALL_MACHINE_TYPES.includes(input.machineType)) {
                    throw new BusinessRuleError('Tipe mesin tidak valid');
                }
                if (input.ratePerKg < 0) {
                    throw new BusinessRuleError('Rate /kg tidak boleh negatif');
                }
                const status =
                    input.status ??
                    (input.ratePerKg > 0 ? 'ACTIVE' : 'INACTIVE');
                const row = await upsertRateWithAudit(
                    session.user.id,
                    input.machineType,
                    input.ratePerKg,
                    status,
                );
                revalidatePath('/hrd/piece-rates');
                return {
                    id: row.id,
                    machineType: row.machineType,
                    ratePerKg: Number(row.ratePerKg),
                    status: row.status,
                };
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error('Failed to upsert process piece rate', {
                    error,
                    module: 'PieceRateActions',
                });
                throw new BusinessRuleError('Gagal menyimpan tarif borongan');
            }
        });
    },
);
