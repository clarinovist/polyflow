'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    getRoleMappings as getRoleMappingsService,
    updateRoleMapping as updateRoleMappingService,
    seedTenantAccountRoles,
} from '@/services/accounting/coa-seed-service';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { revalidatePath } from 'next/cache';

/** Get all role mappings for the current tenant. */
export const getRoleMappings = withTenant(
    async function getRoleMappings() {
        return safeAction(async () => {
            await requireAuth();
            const tenantId = getTenantIdFromContext();
            if (!tenantId) throw new BusinessRuleError('No tenant context');

            const mappings = await getRoleMappingsService(tenantId, prisma);
            return serializeData(mappings);
        });
    }
);

/** Update a single role mapping. Validates account exists and is active. */
export const updateRoleMapping = withTenant(
    async function updateRoleMapping(role: string, accountId: string) {
        return safeAction(async () => {
            await requireAuth();
            const tenantId = getTenantIdFromContext();
            if (!tenantId) throw new BusinessRuleError('No tenant context');

            if (!role || !accountId) {
                throw new BusinessRuleError('Role and accountId are required');
            }

            try {
                await updateRoleMappingService(tenantId, role, accountId, prisma);
            } catch (e) {
                throw new BusinessRuleError(e instanceof Error ? e.message : 'Failed to update mapping');
            }
            revalidatePath('/finance/coa/roles');
            return { success: true };
        });
    }
);

/** Seed missing role mappings (create-only, no overwrite). */
export const seedMissingMappings = withTenant(
    async function seedMissingMappings() {
        return safeAction(async () => {
            await requireAuth();
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
    }
);

/** Reset all mappings to pattern defaults (force mode, requires confirmation). */
export const resetAllMappings = withTenant(
    async function resetAllMappings() {
        return safeAction(async () => {
            await requireAuth();
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
    }
);
