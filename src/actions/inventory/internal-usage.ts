'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { requireWarehouseResourcePermission } from '@/lib/tools/auth-checks';
import { safeAction } from '@/lib/errors/errors';
import { hasAnyRole } from '@/lib/auth/roles';
import {
    INTERNAL_USAGE_RESOURCE,
    type InternalUsageInput,
} from '@/lib/schemas/internal-usage';
import { createInternalUsage } from '@/services/inventory/internal-usage-service';
import { checkInternalUsageReadiness } from '@/services/inventory/internal-usage-readiness';
import {
    getInternalUsageDetail,
    getInternalUsageFormData,
    getInternalUsageHistory,
} from '@/services/inventory/internal-usage-query-service';

export const getInternalUsageHistoryAction = withTenant(
    async function getInternalUsageHistoryAction(filters: unknown = {}) {
        return safeAction(async () => {
            await requireWarehouseResourcePermission(INTERNAL_USAGE_RESOURCE);
            return getInternalUsageHistory(filters);
        });
    },
);
export const getInternalUsageDetailAction = withTenant(
    async function getInternalUsageDetailAction(id: string) {
        return safeAction(async () => {
            await requireWarehouseResourcePermission(INTERNAL_USAGE_RESOURCE);
            return getInternalUsageDetail(id);
        });
    },
);
export const getInternalUsageFormAction = withTenant(
    async function getInternalUsageFormAction() {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                INTERNAL_USAGE_RESOURCE,
            );
            return getInternalUsageFormData(session.user.id);
        });
    },
);
export const checkInternalUsageReadinessAction = withTenant(
    async function checkInternalUsageReadinessAction(input: unknown) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                INTERNAL_USAGE_RESOURCE,
            );
            // Warehouse staff get the cause and next step; account values are Finance's.
            return checkInternalUsageReadiness(input, {
                includeAccounting: hasAnyRole(session.user, [
                    'ADMIN',
                    'FINANCE',
                ]),
            });
        });
    },
);
export const createInternalUsageAction = withTenant(
    async function createInternalUsageAction(input: InternalUsageInput) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                INTERNAL_USAGE_RESOURCE,
            );
            const result = await createInternalUsage(input, session.user.id);
            for (const path of [
                INTERNAL_USAGE_RESOURCE,
                '/warehouse',
                '/warehouse/inventory',
                '/warehouse/inventory/history',
                '/warehouse/inventory/balance',
                '/finance/journals',
            ])
                revalidatePath(path);
            return result;
        });
    },
);
