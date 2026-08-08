'use server';

import { withTenant } from '@/lib/core/tenant';
import { safeAction, ValidationError } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    requireSalesAccess,
    requireSalesManager,
} from '@/lib/auth/sales-access';
import { getFieldSalesScope } from '@/services/sales/field-scope';
import {
    upsertTarget as svcUpsertTarget,
    bulkSetTargets as svcBulkSetTargets,
    copyTargetsFromPreviousMonth as svcCopyFromPrev,
    getTargetsForPeriod as svcGetTargetsForPeriod,
    getTargetContext as svcGetTargetContext,
    type UpsertTargetInput,
} from '@/services/sales/target-service';
import {
    getCompanyTarget as svcGetCompanyTarget,
    setCompanyTarget as svcSetCompanyTarget,
} from '@/services/sales/company-target-service';

// ── Zod-ish validation inline (don't add new dep) ──

function validateUpsertInput(raw: unknown): UpsertTargetInput {
    const r = raw as Record<string, unknown>;
    if (!r || typeof r !== 'object')
        throw new ValidationError('Input tidak valid');
    const userId = r.userId as string;
    const periodYear = Number(r.periodYear);
    const periodMonth = Number(r.periodMonth);
    const revenueTarget = r.revenueTarget as number | undefined;
    if (!userId) throw new ValidationError('userId wajib diisi');
    if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100)
        throw new ValidationError(`periodYear tidak valid: ${periodYear}`);
    if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12)
        throw new ValidationError(`periodMonth harus 1-12`);
    if (revenueTarget == null || Number(revenueTarget) < 0)
        throw new ValidationError('revenueTarget harus >= 0');

    return {
        userId,
        periodYear,
        periodMonth,
        revenueTarget: Number(revenueTarget),
        visitTarget:
            r.visitTarget != null ? Number(r.visitTarget as number) : null,
        orderTarget:
            r.orderTarget != null ? Number(r.orderTarget as number) : null,
        notes: (r.notes as string | null) ?? null,
        createdById: (r.createdById as string | undefined) ?? undefined,
    };
}

// ── Write: upsert single ──

export const upsertTargetAction = withTenant(async function upsertTargetAction(
    rawInput: Record<string, unknown>,
) {
    return safeAction(async () => {
        const session = await requireSalesManager();
        const input = validateUpsertInput({
            ...rawInput,
            createdById: (rawInput.createdById as string) ?? session.user.id,
        });
        const result = await svcUpsertTarget(input);
        return serializeData(result);
    });
});

// ── Write: bulk set ──

export const bulkSetTargetsAction = withTenant(
    async function bulkSetTargetsAction(
        rawItems: Record<string, unknown>[],
        periodYear: number,
        periodMonth: number,
    ) {
        return safeAction(async () => {
            const session = await requireSalesManager();
            if (!Array.isArray(rawItems) || rawItems.length === 0)
                throw new ValidationError('items kosong');

            const items: UpsertTargetInput[] = rawItems.map((r) =>
                validateUpsertInput({
                    ...r,
                    periodYear: (r.periodYear as number) ?? periodYear,
                    periodMonth: (r.periodMonth as number) ?? periodMonth,
                    createdById: (r.createdById as string) ?? session.user.id,
                }),
            );

            const result = await svcBulkSetTargets(items);
            return serializeData(result);
        });
    },
);

// ── Write: copy dari bulan lalu ──

export const copyTargetsFromPreviousMonthAction = withTenant(
    async function copyTargetsFromPreviousMonthAction(
        periodYear: number,
        periodMonth: number,
    ) {
        return safeAction(async () => {
            const session = await requireSalesManager();
            const result = await svcCopyFromPrev(
                Number(periodYear),
                Number(periodMonth),
                session.user.id,
            );
            return serializeData(result);
        });
    },
);

// ── Read: list with achievement + scoping SALES vs ADMIN/MARKETING ──

export const getTargetsForPeriodAction = withTenant(
    async function getTargetsForPeriodAction(
        periodYear: number,
        periodMonth: number,
    ) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);

            const allTargets = await svcGetTargetsForPeriod(
                Number(periodYear),
                Number(periodMonth),
            );

            // SALES biasa: hanya milik dirinya sendiri
            // Pola scoping sama dengan field-scope.ts: ADMIN/MARKETING = global viewer
            const filtered = scope.isGlobalViewer
                ? allTargets
                : allTargets.filter((t) => t.userId === scope.actorUserId);

            return serializeData(filtered);
        });
    },
);

// ── Read: konteks historis (prevMonth/avg3Month/sameMonthLastYear) — T4 ──

export const getTargetContextAction = withTenant(
    async function getTargetContextAction(
        userIds: string[],
        periodYear: number,
        periodMonth: number,
    ) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);

            const ids = Array.isArray(userIds) ? userIds : [];
            const scopedIds = scope.isGlobalViewer
                ? ids
                : ids.filter((id) => id === scope.actorUserId);

            const contextMap = await svcGetTargetContext(
                scopedIds,
                Number(periodYear),
                Number(periodMonth),
            );

            return serializeData(Array.from(contextMap.values()));
        });
    },
);

// ── Read: target perusahaan (T6) ──

export const getCompanyTargetAction = withTenant(
    async function getCompanyTargetAction(
        periodYear: number,
        periodMonth: number,
    ) {
        return safeAction(async () => {
            await requireSalesAccess();
            const value = await svcGetCompanyTarget(
                Number(periodYear),
                Number(periodMonth),
            );
            return serializeData({ value });
        });
    },
);

// ── Write: target perusahaan (T6) ──

export const setCompanyTargetAction = withTenant(
    async function setCompanyTargetAction(
        periodYear: number,
        periodMonth: number,
        value: number,
    ) {
        return safeAction(async () => {
            const session = await requireSalesManager();
            const result = await svcSetCompanyTarget(
                Number(periodYear),
                Number(periodMonth),
                Number(value),
                session.user.id,
            );
            return serializeData({ value: result });
        });
    },
);
