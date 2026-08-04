'use server';

import { withTenant } from '@/lib/core/tenant';
import {
    prisma,
    getMainPrisma,
    getTenantIdFromContext,
} from '@/lib/core/prisma';
import { requireFinanceAccess, requireFinanceMutation } from '@/lib/auth/finance-access';
import {
    safeAction,
    BusinessRuleError,
    ValidationError,
    NotFoundError,
} from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { revalidatePath } from 'next/cache';
import {
    revenueRuleCreateSchema,
    revenueRuleUpdateSchema,
} from '@/lib/finance/revenue-rule-schemas';

/** Validate target account exists, is active, and is a REVENUE account. */
async function assertActiveRevenueAccount(code: string) {
    const account = await prisma.account.findUnique({ where: { code } });
    if (!account || account.isActive === false || account.type !== 'REVENUE') {
        throw new BusinessRuleError(
            'Akun tidak ditemukan, tidak aktif, atau bukan akun pendapatan',
        );
    }
    return account;
}

/**
 * Ownership guard: rules live in the main DB; a guessed rule ID must not
 * let one tenant mutate another tenant's row.
 */
async function requireOwnedRule(ruleId: string, tenantId: string) {
    const rule = await getMainPrisma().tenantRevenueRule.findFirst({
        where: { id: ruleId, tenantId },
    });
    if (!rule) throw new NotFoundError('Revenue rule', ruleId);
    return rule;
}

/** Get all revenue rules for the current tenant. */
export const getRevenueRules = withTenant(async function getRevenueRules() {
    return safeAction(async () => {
        await requireFinanceAccess();
        const tenantId = getTenantIdFromContext();
        if (!tenantId) throw new BusinessRuleError('No tenant context');

        const rules = await getMainPrisma().tenantRevenueRule.findMany({
            where: { tenantId },
            orderBy: { priority: 'asc' },
        });
        return serializeData(rules);
    });
});

/** Create a new revenue rule. */
export const createRevenueRule = withTenant(
    async function createRevenueRule(data: unknown) {
        return safeAction(async () => {
            await requireFinanceMutation();
            const tenantId = getTenantIdFromContext();
            if (!tenantId) throw new BusinessRuleError('No tenant context');

            const parsed = revenueRuleCreateSchema.safeParse(data);
            if (!parsed.success) {
                throw new ValidationError(parsed.error.issues[0].message);
            }
            const input = parsed.data;

            const account = await assertActiveRevenueAccount(input.accountCode);

            const rule = await getMainPrisma().tenantRevenueRule.create({
                data: {
                    tenantId,
                    matchType: input.matchType,
                    matchValue: input.matchValue,
                    accountId: account.id,
                    accountCode: account.code,
                    accountName: account.name,
                    priority: input.priority,
                },
            });

            revalidatePath('/finance/coa/revenue-rules');
            return serializeData(rule);
        });
    },
);

/** Update a revenue rule (ownership-checked). Also serves edit + toggle. */
export const updateRevenueRule = withTenant(async function updateRevenueRule(
    ruleId: string,
    data: unknown,
) {
    return safeAction(async () => {
        await requireFinanceMutation();
        const tenantId = getTenantIdFromContext();
        if (!tenantId) throw new BusinessRuleError('No tenant context');

        const parsed = revenueRuleUpdateSchema.safeParse(data);
        if (!parsed.success) {
            throw new ValidationError(parsed.error.issues[0].message);
        }
        const input = parsed.data;

        await requireOwnedRule(ruleId, tenantId);

        const updateData: Record<string, unknown> = {};
        if (input.matchType !== undefined) updateData.matchType = input.matchType;
        if (input.matchValue !== undefined) updateData.matchValue = input.matchValue;
        if (input.priority !== undefined) updateData.priority = input.priority;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;
        if (input.accountCode !== undefined) {
            const account = await assertActiveRevenueAccount(input.accountCode);
            updateData.accountId = account.id;
            updateData.accountCode = account.code;
            updateData.accountName = account.name;
        }

        await getMainPrisma().tenantRevenueRule.update({
            where: { id: ruleId },
            data: updateData,
        });

        revalidatePath('/finance/coa/revenue-rules');
        return { success: true };
    });
});

/** Delete a revenue rule (ownership-checked). */
export const deleteRevenueRule = withTenant(async function deleteRevenueRule(
    ruleId: string,
) {
    return safeAction(async () => {
        await requireFinanceMutation();
        const tenantId = getTenantIdFromContext();
        if (!tenantId) throw new BusinessRuleError('No tenant context');

        await requireOwnedRule(ruleId, tenantId);

        await getMainPrisma().tenantRevenueRule.delete({
            where: { id: ruleId },
        });
        revalidatePath('/finance/coa/revenue-rules');
        return { success: true };
    });
});
