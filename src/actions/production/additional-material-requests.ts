'use server';

import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { withTenant } from '@/lib/core/tenant';
import {
    BusinessRuleError,
    isNextControlFlowError,
    safeAction,
} from '@/lib/errors/errors';
import {
    additionalMaterialRequestSchema,
    confirmAdditionalMaterialRequestSchema,
    rejectAdditionalMaterialRequestSchema,
    type AdditionalMaterialRequestValues,
    type ConfirmAdditionalMaterialRequestValues,
    type RejectAdditionalMaterialRequestValues,
} from '@/lib/schemas/production';
import { requireWarehouseStockRole } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { AdditionalMaterialRequestService } from '@/services/production/additional-material-request-service';

export const requestAdditionalMaterial = withTenant(
    async function requestAdditionalMaterial(data: AdditionalMaterialRequestValues) {
        return safeAction(async () => {
            const parsed = additionalMaterialRequestSchema.safeParse(data);
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }
            try {
                const request =
                    await AdditionalMaterialRequestService.createRequest(
                        parsed.data,
                    );
                revalidatePath('/warehouse/materials');
                revalidatePath(`/kiosk/jobs/${parsed.data.productionOrderId}`);
                return request;
            } catch (error) {
                if (isNextControlFlowError(error)) throw error;
                if (error instanceof BusinessRuleError) throw error;
                logger.error('Failed to request additional material', {
                    error,
                    module: 'ProductionActions',
                });
                throw new BusinessRuleError(
                    'Gagal mengirim permintaan bahan tambahan. Silakan coba lagi.',
                );
            }
        });
    },
);

export const getPendingAdditionalMaterialRequests = withTenant(
    async function getPendingAdditionalMaterialRequests() {
        return safeAction(async () => {
            await requireWarehouseStockRole();
            const requests =
                await AdditionalMaterialRequestService.listPendingRequests();
            return serializeData(requests);
        });
    },
);

export const confirmAdditionalMaterialRequest = withTenant(
    async function confirmAdditionalMaterialRequest(
        data: ConfirmAdditionalMaterialRequestValues,
    ) {
        return safeAction(async () => {
            const parsed = confirmAdditionalMaterialRequestSchema.safeParse(data);
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }
            try {
                const session = await requireWarehouseStockRole();
                const result =
                    await AdditionalMaterialRequestService.confirmRequest({
                        ...parsed.data,
                        reviewerId: session.user.id,
                    });
                revalidatePath('/warehouse');
                revalidatePath('/warehouse/materials');
                revalidatePath('/production');
                revalidatePath(
                    `/production/orders/${result.productionOrderId}`,
                );
                return result;
            } catch (error) {
                if (isNextControlFlowError(error)) throw error;
                if (error instanceof BusinessRuleError) throw error;
                logger.error('Failed to confirm additional material request', {
                    error,
                    module: 'ProductionActions',
                });
                throw new BusinessRuleError(
                    'Gagal mengonfirmasi bahan tambahan. Silakan coba lagi.',
                );
            }
        });
    },
);

export const rejectAdditionalMaterialRequest = withTenant(
    async function rejectAdditionalMaterialRequest(
        data: RejectAdditionalMaterialRequestValues,
    ) {
        return safeAction(async () => {
            const parsed = rejectAdditionalMaterialRequestSchema.safeParse(data);
            if (!parsed.success) {
                throw new BusinessRuleError(parsed.error.issues[0].message);
            }
            try {
                const session = await requireWarehouseStockRole();
                const result =
                    await AdditionalMaterialRequestService.rejectRequest({
                        ...parsed.data,
                        reviewerId: session.user.id,
                    });
                revalidatePath('/warehouse');
                revalidatePath('/warehouse/materials');
                revalidatePath(
                    `/production/orders/${result.productionOrderId}`,
                );
                return result;
            } catch (error) {
                if (isNextControlFlowError(error)) throw error;
                if (error instanceof BusinessRuleError) throw error;
                logger.error('Failed to reject additional material request', {
                    error,
                    module: 'ProductionActions',
                });
                throw new BusinessRuleError(
                    'Gagal menolak bahan tambahan. Silakan coba lagi.',
                );
            }
        });
    },
);
