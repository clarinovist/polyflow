'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';

/** Get all revenue rules for the current tenant. */
export const getRevenueRules = withTenant(
    async function getRevenueRules() {
        return safeAction(async () => {
            await requireAuth();
            const tenantId = getTenantIdFromContext();
            if (!tenantId) throw new BusinessRuleError('No tenant context');

            const rules = await prisma.tenantRevenueRule.findMany({
                where: { tenantId },
                orderBy: { priority: 'asc' },
            });
            return serializeData(rules);
        });
    }
);

/** Create a new revenue rule. */
export const createRevenueRule = withTenant(
    async function createRevenueRule(data: {
        matchType: string;
        matchValue: string;
        accountCode: string;
        priority?: number;
    }) {
        return safeAction(async () => {
            await requireAuth();
            const tenantId = getTenantIdFromContext();
            if (!tenantId) throw new BusinessRuleError('No tenant context');

            // Validate account exists in tenant DB
            const account = await prisma.account.findUnique({ where: { code: data.accountCode } });
            if (!account || account.isActive === false) {
                throw new BusinessRuleError('Account not found or inactive');
            }

            const rule = await prisma.tenantRevenueRule.create({
                data: {
                    tenantId,
                    matchType: data.matchType,
                    matchValue: data.matchValue,
                    accountId: account.id,
                    accountCode: account.code,
                    accountName: account.name,
                    priority: data.priority ?? 100,
                },
            });

            revalidatePath('/finance/coa/revenue-rules');
            return serializeData(rule);
        });
    }
);

/** Update a revenue rule. */
export const updateRevenueRule = withTenant(
    async function updateRevenueRule(ruleId: string, data: {
        matchType?: string;
        matchValue?: string;
        accountCode?: string;
        priority?: number;
        isActive?: boolean;
    }) {
        return safeAction(async () => {
            await requireAuth();

            const updateData: Record<string, unknown> = { ...data };

            if (data.accountCode) {
                const account = await prisma.account.findUnique({ where: { code: data.accountCode } });
                if (!account || account.isActive === false) {
                    throw new BusinessRuleError('Account not found or inactive');
                }
                updateData.accountId = account.id;
                updateData.accountCode = account.code;
                updateData.accountName = account.name;
            }

            await prisma.tenantRevenueRule.update({
                where: { id: ruleId },
                data: updateData,
            });

            revalidatePath('/finance/coa/revenue-rules');
            return { success: true };
        });
    }
);

/** Delete a revenue rule. */
export const deleteRevenueRule = withTenant(
    async function deleteRevenueRule(ruleId: string) {
        return safeAction(async () => {
            await requireAuth();
            await prisma.tenantRevenueRule.delete({ where: { id: ruleId } });
            revalidatePath('/finance/coa/revenue-rules');
            return { success: true };
        });
    }
);
