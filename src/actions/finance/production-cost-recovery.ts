'use server';

import { z } from 'zod';
import { Prisma } from '@prisma/client';
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
import {
    previewForwardCostPeriod,
    startForwardCostPeriod,
} from '@/services/production/forward-cost-period-service';

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
const inspectPeriodSchema = z
    .object({
        orderId: z.string().uuid(),
        mode: z.enum(['STRICT', 'REVIEWED_LEGACY_SEAL']).default('STRICT'),
    })
    .strict();
const activatePeriodSchema = z
    .object({
        orderId: z.string().uuid(),
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        reason: z.string().trim().min(12).max(1000),
        confirmed: z.literal(true),
        mode: z.enum(['STRICT', 'REVIEWED_LEGACY_SEAL']).optional(),
        acknowledgeRetainedAnomalies: z.boolean().optional(),
    })
    .strict()
    .refine(
        (v) =>
            v.mode !== 'REVIEWED_LEGACY_SEAL' ||
            (v.acknowledgeRetainedAnomalies === true &&
                v.reason.trim().length >= 30),
        'Mode riwayat khusus memerlukan persetujuan anomali dan alasan minimal 30 karakter.',
    );

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

export const inspectForwardCostPeriod = withTenant(
    async function inspectForwardCostPeriod(input: unknown) {
        return safeAction(async () => {
            await requireFinanceAccess();
            const parsed = inspectPeriodSchema.safeParse(input);
            if (!parsed.success)
                throw new ValidationError('ID SPK tidak valid.');
            const { db, backup } = context();
            const preview = await previewForwardCostPeriod(
                db,
                parsed.data.orderId,
                parsed.data.mode,
            );
            const accountIds = preview.historicalBalances.map(
                (b) => b.accountId,
            );
            const accounts = accountIds.length
                ? await db.account.findMany({
                      where: { id: { in: accountIds } },
                      select: { id: true, code: true, name: true },
                  })
                : [];
            const byId = new Map(accounts.map((a) => [a.id, a]));
            return {
                alreadyApplied: preview.alreadyApplied,
                version: preview.version,
                fingerprint: preview.fingerprint,
                historicalAmount: preview.historicalBalances
                    .reduce((s, b) => s.plus(b.amount), new Prisma.Decimal(0))
                    .toFixed(2),
                balances: preview.historicalBalances.map((b) => {
                    const account = byId.get(b.accountId);
                    return {
                        accountId: b.accountId,
                        code: account?.code ?? null,
                        name: account?.name ?? null,
                        amount: b.amount,
                    };
                }),
                anomalies:
                    preview.version === 2 ? preview.anomalies : [],
                movementCount: preview.movementIds.length,
                outputCount: preview.executionIds.length,
                materialIssueCount:
                    preview.version === 2
                        ? preview.materialIssueIds.length
                        : 0,
                scrapRecordCount:
                    preview.version === 2
                        ? preview.scrapRecordIds.length
                        : 0,
                storageReady: backup.ready(),
            };
        });
    },
);

export const activateForwardCostPeriod = withTenant(
    async function activateForwardCostPeriod(input: unknown) {
        return safeAction(async () => {
            const session = await requireFinanceApprover();
            const parsed = activatePeriodSchema.safeParse(input);
            if (!parsed.success) {
                const refineIssue = parsed.error.issues.find(
                    (i) => i.code === 'custom',
                );
                throw new ValidationError(
                    refineIssue?.message ??
                        'Preview, alasan dan persetujuan wajib diisi.',
                );
            }
            const { db, backup } = context();
            return startForwardCostPeriod(
                db,
                { ...parsed.data, actorId: session.user.id },
                backup,
            );
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
