'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { logger } from '@/lib/config/logger';

export const listExecutionsByOperator = withTenant(
  async function listExecutionsByOperator(operatorId: string, from?: string, to?: string) {
    return safeAction(async () => {
      try {
        await requireHrdFinance();
        const now = new Date();
        const fromDate = from ? new Date(from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const toDate = to ? new Date(to) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

        const executions = await prisma.productionExecution.findMany({
          where: {
            operatorId,
            status: { not: 'VOIDED' },
            startTime: { gte: fromDate, lte: toDate },
          },
          select: {
            id: true,
            startTime: true,
            quantityProduced: true,
            pieceRateSnapshot: true,
            pieceEarnings: true,
            pieceMachineType: true,
            status: true,
            productionOrder: {
              select: { id: true, orderNumber: true },
            },
          },
          orderBy: { startTime: 'desc' },
        });

        return executions.map((ex) => ({
          id: ex.id,
          startTime: ex.startTime,
          quantityProduced: ex.quantityProduced,
          pieceRateSnapshot: ex.pieceRateSnapshot,
          pieceEarnings: ex.pieceEarnings,
          pieceMachineType: ex.pieceMachineType,
          status: ex.status,
          orderNumber: ex.productionOrder?.orderNumber ?? '-',
        }));
      } catch (error) {
        logger.error('Failed to list executions by operator', { error, operatorId, module: 'ExecutionsEmployeeActions' });
        throw error;
      }
    });
  },
);
