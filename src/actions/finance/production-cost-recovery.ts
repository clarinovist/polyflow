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
    AuthorizationError,
    BusinessRuleError,
    NotFoundError,
    safeAction,
    ValidationError,
} from '@/lib/errors/errors';
import { AbsorbedScrapRejection } from '@/lib/ops/absorbed-scrap-normalization';
import {
    applyProductionCostRecovery,
    inspectProductionCostRecovery,
} from '@/services/production/cost-recovery-service';
import { productionRecoveryBackup } from '@/services/production/cost-recovery-backup';

const lookupSchema = z
    .object({
        orderId: z.string().uuid().optional(),
        orderNumber: z.string().trim().min(1).max(80).optional(),
    })
    .strict()
    .refine(
        (v) => Boolean(v.orderId) !== Boolean(v.orderNumber),
        'Pilih ID atau nomor SPK persis.',
    );
const applySchema = z
    .object({
        orderId: z.string().uuid(),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        reason: z.string().trim().min(12).max(1000),
        confirmed: z.literal(true),
    })
    .strict();

function context() {
    const db = getTenantDbFromContext(),
        tenantId = getTenantIdFromContext();
    if (!db || !tenantId)
        throw new AuthorizationError('Ruang kerja tenant diperlukan.');
    return { db, backup: productionRecoveryBackup(tenantId) };
}

export const inspectProductionCost = withTenant(
    async function inspectProductionCost(input: unknown) {
        return safeAction(async () => {
            await requireFinanceAccess();
            const parsed = lookupSchema.safeParse(input);
            if (!parsed.success)
                throw new ValidationError('Gunakan ID atau nomor SPK persis.');
            const { db, backup } = context();
            const order = await db.productionOrder.findUnique({
                where: parsed.data.orderId
                    ? { id: parsed.data.orderId }
                    : { orderNumber: parsed.data.orderNumber! },
                select: { id: true },
            });
            if (!order) throw new NotFoundError('Production Order');
            return inspectProductionCostRecovery(db, order.id, backup.ready());
        });
    },
);

export const applyProductionCost = withTenant(
    async function applyProductionCost(input: unknown) {
        return safeAction(async () => {
            const session = await requireFinanceApprover();
            const parsed = applySchema.safeParse(input);
            if (!parsed.success)
                throw new ValidationError(
                    'Preview, alasan minimal 12 karakter, dan persetujuan wajib diisi.',
                );
            const { db, backup } = context();
            try {
                // No revalidation after commit: a lost render response must not masquerade
                // as a rollback. The UI explicitly re-inspects and retries the same fingerprint.
                return await applyProductionCostRecovery(
                    db,
                    { ...parsed.data, actorId: session.user.id },
                    backup,
                );
            } catch (error) {
                if (error instanceof AbsorbedScrapRejection)
                    throw new BusinessRuleError(
                        error.message,
                        undefined,
                        'PRODUCTION_RECOVERY_BLOCKED',
                    );
                throw error;
            }
        });
    },
);
