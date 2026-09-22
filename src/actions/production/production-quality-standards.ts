'use server';

import { withTenant } from '@/lib/core/tenant';
import {
    safeAction,
    BusinessRuleError,
    isNextControlFlowError,
} from '@/lib/errors/errors';
import { requireAuth, requireProductionLeaderRole } from '@/lib/tools/auth-checks';
import {
    qualityCheckParameterSchema,
    updateQualityCheckParameterSchema,
    QualityCheckParameterValues,
    UpdateQualityCheckParameterValues,
} from '@/lib/schemas/production';
import { revalidatePath } from 'next/cache';
import { QualityStandardService } from '@/services/production/quality-standard-service';
import { serializeData } from '@/lib/utils/utils';

// Read tanpa requireAuth — dipanggil dari kiosk (tanpa sesi) untuk cek apakah
// varian yang sedang diproduksi punya step QC yang perlu ditampilkan.
export const getQualityCheckParametersForVariant = withTenant(
    async function getQualityCheckParametersForVariant(
        productVariantId: string,
    ) {
        try {
            const parameters =
                await QualityStandardService.listByVariant(productVariantId, true);
            return { success: true, data: serializeData(parameters) };
        } catch {
            return {
                success: false,
                error: 'Gagal mengambil parameter QC',
            };
        }
    },
);

function revalidateStandards() {
    revalidatePath('/dashboard/products');
    revalidatePath('/production/daily');
    revalidatePath('/production/orders/[id]', 'page');
}

export const getQualityStandardsForVariant = withTenant(async function getQualityStandardsForVariant(productVariantId: string) {
    return safeAction(async () => {
        await requireAuth();
        return serializeData(await QualityStandardService.listByVariant(productVariantId));
    });
});

export const createQualityCheckParameter = withTenant(
    async function createQualityCheckParameter(
        data: QualityCheckParameterValues,
    ) {
        return safeAction(async () => {
            const result = qualityCheckParameterSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }
            await requireProductionLeaderRole();

            try {
                const parameter = await QualityStandardService.create(
                    result.data,
                );
                revalidateStandards();
                return serializeData(parameter);
            } catch (error) {
                if (isNextControlFlowError(error)) throw error;
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(
                    error instanceof Error
                        ? error.message
                        : 'Gagal membuat parameter QC',
                );
            }
        });
    },
);

export const updateQualityCheckParameter = withTenant(
    async function updateQualityCheckParameter(
        data: UpdateQualityCheckParameterValues,
    ) {
        return safeAction(async () => {
            const result = updateQualityCheckParameterSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }
            await requireProductionLeaderRole();

            try {
                const parameter = await QualityStandardService.update(
                    result.data,
                );
                revalidateStandards();
                return serializeData(parameter);
            } catch (error) {
                if (isNextControlFlowError(error)) throw error;
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(
                    error instanceof Error
                        ? error.message
                        : 'Gagal mengubah parameter QC',
                );
            }
        });
    },
);

export const deleteQualityCheckParameter = withTenant(
    async function deleteQualityCheckParameter(id: string) {
        return safeAction(async () => {
            await requireProductionLeaderRole();

            try {
                await QualityStandardService.delete(id);
                revalidateStandards();
                return null;
            } catch (error) {
                if (isNextControlFlowError(error)) throw error;
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(
                    error instanceof Error
                        ? error.message
                        : 'Gagal menghapus parameter QC',
                );
            }
        });
    },
);
