'use server';

import { withTenant } from '@/lib/core/tenant';
import {
    prisma,
    getTenantDbFromContext,
    getTenantIdFromContext,
} from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';
import { requireFinanceAccess, requireFinanceApprover } from '@/lib/auth/finance-access';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import * as CoAIntegrityService from '@/services/accounting/coa-integrity-service';

export type { RequiredRoleAuditItem } from '@/services/accounting/coa-integrity-service';

function tenantDbForAction() {
    return getTenantDbFromContext() ?? prisma;
}

export const auditRequiredAccounts = withTenant(
    async function auditRequiredAccounts() {
        return safeAction(async () => {
            await requireFinanceAccess();
            const tenantId = getTenantIdFromContext();
            if (!tenantId) throw new BusinessRuleError('No tenant context');

            const items = await CoAIntegrityService.auditRequiredAccounts(
                tenantId,
                tenantDbForAction(),
            );

            return {
                total: items.length,
                ok: items.filter((i) => i.status === 'OK').length,
                items,
                isPerfect: items.every((i) => i.status === 'OK'),
            };
        });
    },
);

export const fixMissingAccounts = withTenant(async function fixMissingAccounts() {
    return safeAction(async () => {
        await requireFinanceApprover();
        const tenantId = getTenantIdFromContext();
        if (!tenantId) throw new BusinessRuleError('No tenant context');

        const result = await CoAIntegrityService.fixMissingAccounts(
            tenantId,
            tenantDbForAction(),
        );

        revalidatePath('/finance/settings');

        return {
            count: result.created,
            unresolved: result.unresolved,
        };
    });
});
