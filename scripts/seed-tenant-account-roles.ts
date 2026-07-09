/**
 * Seed TenantAccountRole mappings for all existing ACTIVE tenants.
 *
 * Usage: npx tsx scripts/seed-tenant-account-roles.ts
 *
 * Reads tenant list from MAIN DB, opens each tenant's DB,
 * and creates-only (never overwrites) role mappings.
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
import { getTenantDb } from '../src/lib/core/prisma';
import { seedTenantAccountRoles } from '../src/services/accounting/coa-seed-service';

const mainPrisma = new PrismaClient();

async function main() {
    console.log('=== TenantAccountRole Seed ===\n');

    const tenants = await mainPrisma.tenant.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, subdomain: true, dbUrl: true },
    });

    console.log(`Found ${tenants.length} active tenants:\n`);

    for (const tenant of tenants) {
        console.log(`--- ${tenant.name} (${tenant.subdomain}) ---`);

        const tenantDb = getTenantDb(tenant.dbUrl);

        const result = await seedTenantAccountRoles({
            tenantId: tenant.id,
            tenantDb,
            force: false, // create-only
        });

        console.log(`  Created: ${result.created}`);
        console.log(`  Skipped (existing): ${result.skipped}`);
        if (result.failed.length > 0) {
            console.log(`  Failed (not in COA): ${result.failed.join(', ')}`);
        }
        console.log('');
    }

    console.log('=== Done ===');
}

main()
    .catch(console.error)
    .finally(() => mainPrisma.$disconnect());
