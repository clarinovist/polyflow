/**
 * COA Integrity Service
 *
 * Audits required operational role → account mappings semantically via
 * TenantAccountRole (tenant-independent), never by fixed account codes.
 * Fix delegates to the create-only seedTenantAccountRoles — it never creates
 * raw Account rows (no ghost accounts).
 */
import type { PrismaClient } from '@prisma/client';
import { getMainPrisma } from '@/lib/core/prisma';
import { seedTenantAccountRoles } from './coa-seed-service';
import type { AccountRole } from './account-resolver';

export type IntegrityStatus = 'OK' | 'MISSING' | 'ORPHAN' | 'INACTIVE';

export interface RequiredRoleAuditItem {
    role: AccountRole;
    mappedAccountId: string | null;
    mappedCode: string | null;
    mappedName: string | null;
    liveCode: string | null;
    liveName: string | null;
    status: IntegrityStatus;
}

/** Required operational roles for automated finance/inventory workflows. */
export const REQUIRED_OPERATIONAL_ROLES: AccountRole[] = [
    'accounts-receivable',
    'accounts-payable',
    'sales-revenue',
    'cogs',
    'inventory',
    'raw-material',
    'wip',
    'finished-goods',
    'packaging',
    'scrap',
    'vat-output',
    'vat-input',
    'adjustment-gain',
    'adjustment-loss',
    'manufacturing-overhead',
    'current-year-earnings',
];

/**
 * Audit required roles against the tenant's live COA.
 * status: OK | MISSING (no mapping) | ORPHAN (mapped account gone) | INACTIVE.
 */
export async function auditRequiredAccounts(
    tenantId: string,
    tenantDb: PrismaClient,
): Promise<RequiredRoleAuditItem[]> {
    const mainPrisma = getMainPrisma();
    const mappings = await mainPrisma.tenantAccountRole.findMany({
        where: { tenantId },
    });
    const mappingByRole = new Map(mappings.map((m) => [m.role, m]));

    const items: RequiredRoleAuditItem[] = [];
    for (const role of REQUIRED_OPERATIONAL_ROLES) {
        const mapping = mappingByRole.get(role);
        if (!mapping) {
            items.push({
                role,
                mappedAccountId: null,
                mappedCode: null,
                mappedName: null,
                liveCode: null,
                liveName: null,
                status: 'MISSING',
            });
            continue;
        }

        const account = await tenantDb.account.findUnique({
            where: { id: mapping.accountId },
        });

        let status: IntegrityStatus = 'OK';
        if (!account) status = 'ORPHAN';
        else if (account.isActive === false) status = 'INACTIVE';

        items.push({
            role,
            mappedAccountId: mapping.accountId,
            mappedCode: mapping.accountCode,
            mappedName: mapping.accountName,
            liveCode: account?.code ?? null,
            liveName: account?.name ?? null,
            status,
        });
    }
    return items;
}

export interface FixIntegrityResult {
    created: number;
    skipped: number;
    unresolved: RequiredRoleAuditItem[];
}

/**
 * Create missing role mappings only (delegates to seedTenantAccountRoles,
 * force=false — never overwrites admin remaps) and reports roles still
 * unresolved. Manual recovery surface stays the Role Mapping page.
 */
export async function fixMissingAccounts(
    tenantId: string,
    tenantDb: PrismaClient,
): Promise<FixIntegrityResult> {
    const seedResult = await seedTenantAccountRoles({
        tenantId,
        tenantDb,
        force: false,
    });

    const unresolved = (await auditRequiredAccounts(tenantId, tenantDb)).filter(
        (i) => i.status !== 'OK',
    );

    return {
        created: seedResult.created,
        skipped: seedResult.skipped,
        unresolved,
    };
}
