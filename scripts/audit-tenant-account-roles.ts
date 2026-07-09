/**
 * Audit TenantAccountRole mappings — READ-ONLY.
 * Flags Kiyowo-style codes on Melindo, snapshot/live mismatch, orphans, inactive.
 *
 * Usage:
 *   npx tsx scripts/audit-tenant-account-roles.ts
 *   npx tsx scripts/audit-tenant-account-roles.ts --tenant=melindo
 *   npx tsx scripts/audit-tenant-account-roles.ts --tenant=kiyowo
 */
import { PrismaClient } from '@prisma/client';
import { getTenantDb } from '../src/lib/core/prisma';

const mainPrisma = new PrismaClient();

type Flag =
    | 'KIYOWO_CODE_ON_MELINDO'
    | 'ACCOUNT_INACTIVE'
    | 'ORPHAN'
    | 'NAME_TOO_SPECIFIC'
    | 'SNAPSHOT_MISMATCH'
    | 'LIVE_CODE_KIYOWO_ON_MELINDO';

interface AuditRow {
    tenant: string;
    role: string;
    code: string;
    name: string;
    liveCode: string;
    flags: Flag[];
}

/** Heuristic: Kiyowo-style 5-digit code (e.g., 11110, 51100) */
function isKiyowoCode(code: string): boolean {
    return /^\d{5}$/.test(code);
}

/** Heuristic: name too specific (contains customer/product markers) */
function isNameTooSpecific(name: string): boolean {
    const patterns = ['PD ', 'PT ', 'CV ', 'Tdus', 'Sinar Bintang', 'Maklon'];
    return patterns.some((p) => name.includes(p));
}

async function main() {
    const tenantFilter = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1];

    console.log('=== TenantAccountRole Audit ===\n');

    const tenants = await mainPrisma.tenant.findMany({
        where: tenantFilter ? { subdomain: tenantFilter } : { status: 'ACTIVE' },
        select: { id: true, name: true, subdomain: true, dbUrl: true },
    });

    let totalFlags = 0;
    let highSeverity = 0;

    for (const tenant of tenants) {
        console.log(`--- ${tenant.name} (${tenant.subdomain}) ---`);

        const mappings = await mainPrisma.tenantAccountRole.findMany({
            where: { tenantId: tenant.id },
            orderBy: { role: 'asc' },
        });

        const tenantDb = tenant.dbUrl ? getTenantDb(tenant.dbUrl) : null;
        const rows: AuditRow[] = [];

        for (const m of mappings) {
            const flags: Flag[] = [];
            const isMelindo = tenant.subdomain === 'melindo';
            const snapCode = m.accountCode ?? '';
            const snapName = m.accountName ?? '';

            if (isMelindo && isKiyowoCode(snapCode)) {
                flags.push('KIYOWO_CODE_ON_MELINDO');
            }
            if (snapName && isNameTooSpecific(snapName)) {
                flags.push('NAME_TOO_SPECIFIC');
            }

            let liveCode = 'N/A';
            if (tenantDb) {
                const live = await tenantDb.account.findUnique({
                    where: { id: m.accountId },
                    select: { code: true, name: true, isActive: true },
                });
                if (!live) {
                    flags.push('ORPHAN');
                } else {
                    liveCode = live.code;
                    if (live.isActive === false) flags.push('ACCOUNT_INACTIVE');
                    if (snapCode && live.code !== snapCode) flags.push('SNAPSHOT_MISMATCH');
                    if (isMelindo && isKiyowoCode(live.code)) flags.push('LIVE_CODE_KIYOWO_ON_MELINDO');
                }
            }

            rows.push({
                tenant: tenant.subdomain,
                role: m.role,
                code: snapCode || 'N/A',
                name: snapName || 'N/A',
                liveCode,
                flags,
            });

            if (
                flags.includes('KIYOWO_CODE_ON_MELINDO') ||
                flags.includes('LIVE_CODE_KIYOWO_ON_MELINDO') ||
                flags.includes('ORPHAN')
            ) {
                highSeverity++;
            }
            totalFlags += flags.length;
        }

        const clean = rows.filter((r) => r.flags.length === 0);
        const flagged = rows.filter((r) => r.flags.length > 0);

        if (flagged.length > 0) {
            console.log(`  FLAGGED (${flagged.length}):`);
            for (const r of flagged) {
                console.log(
                    `    ${r.role.padEnd(28)} snap=${r.code.padEnd(8)} live=${r.liveCode.padEnd(8)} ${r.name.padEnd(36)} [${r.flags.join(', ')}]`,
                );
            }
        }

        console.log(`  OK: ${clean.length} roles\n`);
    }

    console.log(`=== Summary ===`);
    console.log(`Tenants: ${tenants.length}`);
    console.log(`High-severity flags: ${highSeverity}`);
    console.log(`Total flags: ${totalFlags}`);

    if (highSeverity > 0) {
        console.log(`\n⚠️  ${highSeverity} high-severity flag(s).`);
        console.log(`   Dry-run: npx tsx scripts/apply-tenant-account-role-fixes.ts --tenant=melindo --dry-run`);
    }

    await mainPrisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await mainPrisma.$disconnect();
    process.exit(1);
});
