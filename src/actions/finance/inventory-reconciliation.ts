'use server';

import { z } from 'zod';
import { withTenant } from '@/lib/core/tenant';
import {
    getTenantDbFromContext,
    getTenantIdFromContext,
} from '@/lib/core/prisma';
import {
    requireFinanceAccess,
    requireFinanceApprover,
} from '@/lib/auth/finance-access';
import {
    atkRecoveryIntentSchema,
    atkRecoveryApplySchema,
} from '@/lib/schemas/atk-recovery';
import {
    previewAtkRecovery,
    applyAtkRecovery,
    getAtkRecoveryReceipt,
} from '@/services/inventory/atk-recovery-service';
import { atkRecoveryBackup } from '@/services/inventory/atk-recovery-backup';
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

export const previewAtkRecoveryAction = withTenant(
    async function previewAtkRecoveryAction(input: unknown) {
        return safeAction(async () => {
            await requireFinanceAccess();
            const parsed = atkRecoveryIntentSchema.safeParse(input);
            if (!parsed.success)
                throw new ValidationError(
                    'Sumber atau jenis koreksi tidak valid.',
                );
            const db = tenantDatabase();
            return previewAtkRecovery(
                db,
                parsed.data,
                atkRecoveryBackup(getTenantIdFromContext()!),
            );
        });
    },
);

export const applyAtkRecoveryAction = withTenant(
    async function applyAtkRecoveryAction(input: unknown) {
        return safeAction(async () => {
            const session = await requireFinanceApprover();
            const parsed = atkRecoveryApplySchema.safeParse(input);
            if (!parsed.success)
                throw new ValidationError(
                    'Preview, alasan, dan persetujuan eksplisit diperlukan.',
                );
            const db = tenantDatabase();
            // No postcommit side effects that could disguise a committed correction as a failure.
            return applyAtkRecovery(
                db,
                parsed.data,
                session.user.id,
                atkRecoveryBackup(getTenantIdFromContext()!),
            );
        });
    },
);

export const getAtkRecoveryReceiptAction = withTenant(
    async function getAtkRecoveryReceiptAction(input: unknown) {
        return safeAction(async () => {
            await requireFinanceAccess();
            const parsed = z
                .object({ requestId: z.string().uuid() })
                .strict()
                .safeParse(input);
            if (!parsed.success)
                throw new ValidationError('Nomor permintaan tidak valid.');
            return getAtkRecoveryReceipt(
                tenantDatabase(),
                parsed.data.requestId,
            );
        });
    },
);

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
