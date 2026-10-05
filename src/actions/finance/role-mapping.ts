'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import {
    requireFinanceAccess,
    requireFinanceMutation,
    requireFinanceAdmin,
} from '@/lib/auth/finance-access';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    getRoleMappings as getRoleMappingsService,
    updateRoleMapping as updateRoleMappingService,
    seedTenantAccountRoles,
} from '@/services/accounting/coa-seed-service';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { isRoleCompatibleAccount } from '@/services/accounting/account-resolver';
import { revalidatePath } from 'next/cache';

/** Get all role mappings for the current tenant. */
export const getRoleMappings = withTenant(async function getRoleMappings() {
    return safeAction(async () => {
        await requireFinanceAccess();
        const tenantId = getTenantIdFromContext();
        if (!tenantId) throw new BusinessRuleError('No tenant context');

        const mappings = await getRoleMappingsService(tenantId, prisma);
        return serializeData(mappings);
    });
});

/** Update a single role mapping. Validates account exists and is active. */
export const updateRoleMapping = withTenant(async function updateRoleMapping(
    role: string,
    accountId: string,
) {
    return safeAction(async () => {
        await requireFinanceMutation();
        const tenantId = getTenantIdFromContext();
        if (!tenantId) throw new BusinessRuleError('No tenant context');

        if (!role || !accountId) {
            throw new BusinessRuleError('Role and accountId are required');
        }

        // F13: tolak mapping yang tidak kompatibel saat simpan (mapping
        // semacam intermediate→akun-afal lolos dulu lalu jadi WARN + fallback).
        const account = await prisma.account.findUnique({
            where: { id: accountId },
        });
        if (!account || account.isActive === false) {
            throw new BusinessRuleError('Akun tidak ditemukan atau nonaktif');
        }
        if (
            !isRoleCompatibleAccount(
                role as Parameters<typeof isRoleCompatibleAccount>[0],
                account,
            )
        ) {
            throw new BusinessRuleError(
                `Akun ${account.code} (${account.name}) tidak kompatibel untuk peran ${role}. ` +
                    'Mapping ditolak agar jurnal tidak jatuh ke fallback diam-diam.',
            );
        }

        try {
            await updateRoleMappingService(tenantId, role, accountId, prisma);
        } catch (e) {
            throw new BusinessRuleError(
                e instanceof Error ? e.message : 'Failed to update mapping',
            );
        }
        revalidatePath('/finance/coa/roles');
        return { success: true };
    });
});

/** Seed missing role mappings (create-only, no overwrite). */
export const seedMissingMappings = withTenant(
    async function seedMissingMappings() {
        return safeAction(async () => {
            await requireFinanceMutation();
            const tenantId = getTenantIdFromContext();
            if (!tenantId) throw new BusinessRuleError('No tenant context');

            const result = await seedTenantAccountRoles({
                tenantId,
                tenantDb: prisma,
                force: false,
            });
            revalidatePath('/finance/coa/roles');
            return serializeData(result);
        });
    },
);

/** Reset all mappings to pattern defaults (force mode, requires confirmation). */
export const resetAllMappings = withTenant(async function resetAllMappings() {
    return safeAction(async () => {
        await requireFinanceAdmin();
        const tenantId = getTenantIdFromContext();
        if (!tenantId) throw new BusinessRuleError('No tenant context');

        const result = await seedTenantAccountRoles({
            tenantId,
            tenantDb: prisma,
            force: true,
        });
        revalidatePath('/finance/coa/roles');
        return serializeData(result);
    });
});
