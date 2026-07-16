'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { MachineType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { logger } from '@/lib/config/logger';

const ALL_MACHINE_TYPES = Object.values(MachineType);

export const listProcessPieceRates = withTenant(async function listProcessPieceRates() {
  return safeAction(async () => {
    const rows = await prisma.processPieceRate.findMany({ orderBy: { machineType: 'asc' } });
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
});

export const upsertProcessPieceRate = withTenant(
  async function upsertProcessPieceRate(input: {
    machineType: MachineType;
    ratePerKg: number;
    status?: 'ACTIVE' | 'INACTIVE';
  }) {
    return safeAction(async () => {
      try {
        if (!ALL_MACHINE_TYPES.includes(input.machineType)) {
          throw new BusinessRuleError('Tipe mesin tidak valid');
        }
        if (input.ratePerKg < 0) {
          throw new BusinessRuleError('Rate /kg tidak boleh negatif');
        }
        const status = input.status ?? (input.ratePerKg > 0 ? 'ACTIVE' : 'INACTIVE');
        const row = await prisma.processPieceRate.upsert({
          where: { machineType: input.machineType },
          create: {
            machineType: input.machineType,
            ratePerKg: input.ratePerKg,
            status,
          },
          update: {
            ratePerKg: input.ratePerKg,
            status,
          },
        });
        revalidatePath('/hrd/piece-rates');
        return {
          id: row.id,
          machineType: row.machineType,
          ratePerKg: Number(row.ratePerKg),
          status: row.status,
        };
      } catch (error) {
        if (error instanceof BusinessRuleError) throw error;
        logger.error('Failed to upsert process piece rate', { error, module: 'PieceRateActions' });
        throw new BusinessRuleError('Gagal menyimpan tarif borongan');
      }
    });
  },
);
