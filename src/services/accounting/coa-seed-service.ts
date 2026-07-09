/**
 * TenantAccountRole Seed Service
 *
 * Seeds role→account mappings for a tenant using Phase 1 pattern resolution.
 * create-only by default (protects admin remaps); force mode upserts all.
 */
import { PrismaClient } from '@prisma/client';
import { getMainPrisma } from '@/lib/core/prisma';
import { resolveByPatterns, getAllAccountRoles, clearAccountCache } from './account-resolver';
import type { AccountRole } from './account-resolver';

export type SeedResult = {
    created: number;
    skipped: number;
    updated: number;
    failed: string[];
};

export type SeedOptions = {
    tenantId: string;
    tenantDb: PrismaClient;
    /** If true, overwrite existing mappings. Requires UI confirmation. */
    force?: boolean;
};

/**
 * Seed TenantAccountRole mappings for a tenant.
 *
 * - create-only (default): only creates missing roles, never updates existing
 * - force: upserts all resolvable roles (overwrites admin remaps)
 *
 * Uses resolveByPatterns() directly — never resolveAccount() — to avoid
 * reading own incomplete rows / circularity.
 */
export async function seedTenantAccountRoles(opts: SeedOptions): Promise<SeedResult> {
    const { tenantId, tenantDb, force = false } = opts;
    const mainPrisma = getMainPrisma();
    const roles = getAllAccountRoles();

    const result: SeedResult = { created: 0, skipped: 0, updated: 0, failed: [] };

    // Load existing mappings for this tenant
    const existing = await mainPrisma.tenantAccountRole.findMany({
        where: { tenantId },
    });
    const existingMap = new Map(existing.map(m => [m.role, m]));

    for (const role of roles) {
        // Skip if mapping exists and not force mode
        const existingMapping = existingMap.get(role);
        if (existingMapping && !force) {
            result.skipped++;
            continue;
        }

        try {
            // Resolve using patterns against the tenant's COA
            const resolved = await resolveByPatterns(role, tenantDb);

            if (existingMapping && force) {
                // Update existing mapping
                await mainPrisma.tenantAccountRole.update({
                    where: { id: existingMapping.id },
                    data: {
                        accountId: resolved.id,
                        accountCode: resolved.code,
                        accountName: resolved.name,
                    },
                });
                result.updated++;
            } else {
                // Create new mapping
                await mainPrisma.tenantAccountRole.create({
                    data: {
                        tenantId,
                        role,
                        accountId: resolved.id,
                        accountCode: resolved.code,
                        accountName: resolved.name,
                    },
                });
                result.created++;
            }
        } catch {
            // Role not found in tenant's COA — skip (tenant may not have this account)
            result.failed.push(role);
        }
    }

    // Clear cache so resolveAccount picks up new mappings
    clearAccountCache();

    return result;
}

/**
 * Get all role mappings for a tenant, including live account status.
 */
export async function getRoleMappings(tenantId: string, tenantDb: PrismaClient) {
    const mainPrisma = getMainPrisma();
    const mappings = await mainPrisma.tenantAccountRole.findMany({
        where: { tenantId },
        orderBy: { role: 'asc' },
    });

    const allRoles = getAllAccountRoles();
    const mappedRoles = new Set(mappings.map(m => m.role));

    // Check which mapped accounts still exist and are active
    const results = await Promise.all(
        mappings.map(async (m) => {
            const account = await tenantDb.account.findUnique({ where: { id: m.accountId } });
            const status = !account ? 'ORPHAN' : account.isActive === false ? 'INACTIVE' : 'OK';
            return {
                role: m.role as AccountRole,
                accountId: m.accountId,
                accountCode: m.accountCode,
                accountName: m.accountName,
                liveCode: account?.code ?? null,
                liveName: account?.name ?? null,
                status,
            };
        })
    );

    // Add unmapped roles
    for (const role of allRoles) {
        if (!mappedRoles.has(role)) {
            results.push({
                role,
                accountId: null,
                accountCode: null,
                accountName: null,
                liveCode: null,
                liveName: null,
                status: 'MISSING',
            });
        }
    }

    return results.sort((a, b) => a.role.localeCompare(b.role));
}

/**
 * Update a single role mapping. Validates role whitelist + account exists and is active.
 */
export async function updateRoleMapping(
    tenantId: string,
    role: string,
    accountId: string,
    tenantDb: PrismaClient,
) {
    const knownRoles = getAllAccountRoles();
    if (!knownRoles.includes(role as AccountRole)) {
        throw new Error(`Unknown account role: "${role}"`);
    }

    // Validate account exists and is active in tenant DB
    const account = await tenantDb.account.findUnique({ where: { id: accountId } });
    if (!account) {
        throw new Error('Account not found in this tenant');
    }
    if (account.isActive === false) {
        throw new Error('Account is inactive');
    }

    const mainPrisma = getMainPrisma();

    await mainPrisma.tenantAccountRole.upsert({
        where: { tenantId_role: { tenantId, role } },
        update: {
            accountId: account.id,
            accountCode: account.code,
            accountName: account.name,
        },
        create: {
            tenantId,
            role,
            accountId: account.id,
            accountCode: account.code,
            accountName: account.name,
        },
    });

    // Clear cache so resolveAccount picks up the change
    clearAccountCache();
}
