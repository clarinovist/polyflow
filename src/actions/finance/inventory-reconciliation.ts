'use server';

import { z } from 'zod';
import { withTenant } from '@/lib/core/tenant';
import {
    getTenantDbFromContext,
    getTenantIdFromContext,
} from '@/lib/core/prisma';
import { requireFinanceAccess } from '@/lib/auth/finance-access';
import {
    AuthorizationError,
    safeAction,
    ValidationError,
} from '@/lib/errors/errors';
import {
    inspectInventoryReconciliation,
    listReconciliationCatalog,
} from '@/services/inventory/reconciliation-diagnosis-service';

const listSchema = z
    .object({
        query: z.string().trim().max(100).default(''),
        page: z.number().int().min(1).max(10000).default(1),
    })
    .strict();
const inspectSchema = z
    .object({ variantId: z.string().trim().min(1).max(100) })
    .strict();

function tenantDatabase() {
    const db = getTenantDbFromContext();
    if (!db || !getTenantIdFromContext())
        throw new AuthorizationError('Ruang kerja tenant diperlukan.');
    return db;
}

export const listInventoryReconciliation = withTenant(
    async function listInventoryReconciliation(input: unknown) {
        return safeAction(async () => {
            await requireFinanceAccess();
            const parsed = listSchema.safeParse(input);
            if (!parsed.success)
                throw new ValidationError(
                    'Pencarian atau halaman tidak valid.',
                );
            return listReconciliationCatalog(
                tenantDatabase(),
                parsed.data.query,
                parsed.data.page,
            );
        });
    },
);

export const inspectInventoryReconciliationAction = withTenant(
    async function inspectInventoryReconciliationAction(input: unknown) {
        return safeAction(async () => {
            await requireFinanceAccess();
            const parsed = inspectSchema.safeParse(input);
            if (!parsed.success)
                throw new ValidationError('Pilih satu SKU yang valid.');
            return inspectInventoryReconciliation(
                tenantDatabase(),
                parsed.data.variantId,
            );
        });
    },
);
