'use server';

import { withTenant } from '@/lib/core/tenant';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { logger } from '@/lib/config/logger';
import {
    safeAction,
    BusinessRuleError,
    isNextControlFlowError,
} from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { ProductionService } from '@/services/production/production-service';
import { MrpService } from '@/services/production/mrp-service';

export const getBomWithInventory = withTenant(
    async function getBomWithInventory(
        bomId: string,
        sourceLocationId: string,
        plannedQuantity: number,
    ) {
        return safeAction(async () => {
            try {
                const result = await ProductionService.getBomWithInventory(
                    bomId,
                    sourceLocationId,
                    plannedQuantity,
                );
                if (!result.ok) {
                    logger.warn('getBomWithInventory failed', {
                        bomId,
                        sourceLocationId,
                        tenantId: getTenantIdFromContext(),
                        error: result.error.message,
                        module: 'ProductionActions',
                    });
                    throw new BusinessRuleError(result.error.message);
                }
                return result.value;
            } catch (error) {
                if (isNextControlFlowError(error)) throw error;
                if (error instanceof BusinessRuleError) throw error;
                logger.error('Failed to calculate BOM requirements', {
                    error,
                    module: 'ProductionActions',
                });
                throw new BusinessRuleError(
                    'Failed to calculate material requirements. Please try again.',
                );
            }
        });
    },
);

export const simulateMrp = withTenant(async function simulateMrp(
    salesOrderId: string,
) {
    return safeAction(async () => {
        try {
            await requireAuth();

            const result =
                await MrpService.simulateMaterialRequirements(salesOrderId);
            return serializeData(result);
        } catch (error) {
            if (isNextControlFlowError(error)) throw error;
            if (error instanceof BusinessRuleError) throw error;
            throw new BusinessRuleError(
                error instanceof Error
                    ? error.message
                    : 'Failed to simulate MRP',
            );
        }
    });
});
