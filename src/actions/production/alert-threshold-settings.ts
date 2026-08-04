'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { revalidatePath } from 'next/cache';
import {
    safeAction,
    AuthorizationError,
    ValidationError,
} from '@/lib/errors/errors';
import { isTenantAdmin } from '@/lib/auth/roles';
import { requireAuth } from '@/lib/tools/auth-checks';
import {
    PRODUCTION_ALERT_THRESHOLDS_KEY,
    parseProductionAlertThresholds,
    productionAlertThresholdsSchema,
    resolveProductionAlertThresholds,
    type ProductionAlertThresholds,
    type ProductionAlertThresholdsInput,
} from '@/lib/production/alert-thresholds';
import { logger } from '@/lib/config/logger';

async function requireAdminId(): Promise<string> {
    const session = await auth();
    if (!session?.user || !isTenantAdmin(session.user)) {
        throw new AuthorizationError(
            'Hanya admin yang dapat mengubah pengaturan threshold produksi.',
        );
    }
    const id = session.user.id;
    if (!id) throw new AuthorizationError('Sesi tidak valid.');
    return id;
}

/**
 * Admin read of the tenant's production alert thresholds.
 * Missing/malformed setting resolves to defaults.
 */
export const getProductionAlertThresholds = withTenant(
    async function getProductionAlertThresholds() {
        return safeAction(async () => {
            await requireAdminId();
            const row = await prisma.appSetting.findUnique({
                where: { key: PRODUCTION_ALERT_THRESHOLDS_KEY },
                select: { value: true },
            });
            return resolveProductionAlertThresholds(
                parseProductionAlertThresholds(row?.value),
            );
        });
    },
);

/**
 * Admin save of the tenant's production alert thresholds — one JSON upsert.
 */
export const saveProductionAlertThresholds = withTenant(
    async function saveProductionAlertThresholds(
        input: ProductionAlertThresholds,
    ) {
        return safeAction(async () => {
            const adminId = await requireAdminId();
            const parsed = productionAlertThresholdsSchema.safeParse(input);
            if (!parsed.success) {
                throw new ValidationError(
                    'Format pengaturan threshold produksi tidak valid. Periksa rentang nilai.',
                );
            }
            const value = JSON.stringify(parsed.data);
            try {
                await prisma.appSetting.upsert({
                    where: { key: PRODUCTION_ALERT_THRESHOLDS_KEY },
                    create: {
                        key: PRODUCTION_ALERT_THRESHOLDS_KEY,
                        value,
                        updatedBy: adminId,
                    },
                    update: { value, updatedBy: adminId },
                });
                revalidatePath('/production/analytics');
                revalidatePath('/production');
                revalidatePath('/production/history');
                revalidatePath('/production/mobile');
                revalidatePath('/production/mobile/insights');
                revalidatePath('/dashboard/machines');
                return resolveProductionAlertThresholds(parsed.data);
            } catch (error) {
                logger.error('Failed to save production alert thresholds', {
                    error,
                    module: 'AlertThresholdSettings',
                });
                throw new ValidationError(
                    'Gagal menyimpan pengaturan threshold. Silakan coba lagi.',
                );
            }
        });
    },
);

/**
 * Read-only fetch of production alert thresholds for authenticated pages.
 * No admin guard — any authenticated user can read so server pages can load
 * the same resolved settings once and pass them down to client components.
 */
export const getProductionAlertThresholdsForPage = withTenant(
    async function getProductionAlertThresholdsForPage() {
        return safeAction(async (): Promise<ProductionAlertThresholdsInput> => {
            await requireAuth();
            const row = await prisma.appSetting.findUnique({
                where: { key: PRODUCTION_ALERT_THRESHOLDS_KEY },
                select: { value: true },
            });
            return resolveProductionAlertThresholds(
                parseProductionAlertThresholds(row?.value),
            );
        });
    },
);
