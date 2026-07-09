/**
 * Apply TenantAccountRole fixes for Melindo (or explicit tenant).
 *
 * Default: dry-run (zero writes). Pass --apply to write.
 * Default tenant: melindo (Kiyowo never touched unless --tenant=...).
 *
 * CRITICAL: updates accountId by looking up preferred code in the TENANT DB.
 * Snapshot accountCode/accountName alone is not enough — resolveAccount uses accountId.
 *
 * Does NOT write JournalLine or any transactional tables.
 *
 * Usage:
 *   npx tsx scripts/apply-tenant-account-role-fixes.ts --tenant=melindo
 *   npx tsx scripts/apply-tenant-account-role-fixes.ts --tenant=melindo --dry-run
 *   npx tsx scripts/apply-tenant-account-role-fixes.ts --tenant=melindo --apply
 */
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { getTenantDb } from '../src/lib/core/prisma';
import { clearAccountCache } from '../src/services/accounting/account-resolver';
import { MELINDO_PREFERRED_MAP, MELINDO_EXCLUDED_ROLES } from './data/melindo-preferred-role-map';

const mainPrisma = new PrismaClient();

type ChangeRow = {
    role: string;
    mappingId: string | null;
    oldAccountId: string | null;
    newAccountId: string;
    oldCode: string;
    newCode: string;
    oldName: string;
    newName: string;
    severity: string;
    action: 'update' | 'create';
};

async function main() {
    const args = process.argv.slice(2);
    const isApply = args.includes('--apply');
    const tenantArg = args.find((a) => a.startsWith('--tenant='))?.split('=')[1] || 'melindo';

    console.log('=== TenantAccountRole Apply Fix ===');
    console.log(`Mode: ${isApply ? 'APPLY (will write TenantAccountRole only)' : 'DRY-RUN (zero writes)'}`);
    console.log(`Tenant: ${tenantArg}\n`);

    const tenant = await mainPrisma.tenant.findFirst({
        where: { subdomain: tenantArg },
    });
    if (!tenant) {
        console.error(`❌ Tenant "${tenantArg}" not found`);
        process.exit(1);
    }
    if (!tenant.dbUrl) {
        console.error(`❌ Tenant "${tenantArg}" has no dbUrl`);
        process.exit(1);
    }

    const tenantDb = getTenantDb(tenant.dbUrl);

    const current = await mainPrisma.tenantAccountRole.findMany({
        where: { tenantId: tenant.id },
    });
    const currentMap = new Map(current.map((m) => [m.role, m]));

    const changes: ChangeRow[] = [];
    const missingInCoa: string[] = [];
    const alreadyOk: string[] = [];

    for (const preferred of MELINDO_PREFERRED_MAP) {
        if (MELINDO_EXCLUDED_ROLES.has(preferred.role)) continue;

        // Resolve preferred account from TENANT COA (source of truth for accountId)
        const account = await tenantDb.account.findUnique({
            where: { code: preferred.code },
        });
        if (!account) {
            missingInCoa.push(`${preferred.role} → code ${preferred.code} not in tenant COA`);
            continue;
        }
        if (account.isActive === false) {
            missingInCoa.push(`${preferred.role} → code ${preferred.code} is inactive`);
            continue;
        }

        const existing = currentMap.get(preferred.role);
        if (!existing) {
            // Create mapping if role never seeded (e.g. bank-charges after Phase 2.1)
            changes.push({
                role: preferred.role,
                mappingId: null,
                oldAccountId: null,
                newAccountId: account.id,
                oldCode: '(none)',
                newCode: account.code,
                oldName: '(none)',
                newName: account.name,
                severity: preferred.severity,
                action: 'create',
            });
            continue;
        }

        const currentCode = existing.accountCode ?? '';
        const sameId = existing.accountId === account.id;
        const sameCode = currentCode === preferred.code;

        if (sameId && sameCode) {
            alreadyOk.push(preferred.role);
            continue;
        }

        // Need update if accountId wrong OR snapshot out of date
        changes.push({
            role: preferred.role,
            mappingId: existing.id,
            oldAccountId: existing.accountId,
            newAccountId: account.id,
            oldCode: currentCode || '(empty)',
            newCode: account.code,
            oldName: existing.accountName ?? '(empty)',
            newName: account.name,
            severity: preferred.severity,
            action: 'update',
        });
    }

    if (missingInCoa.length > 0) {
        console.log('⚠️  Preferred codes missing/inactive in tenant COA:');
        for (const line of missingInCoa) console.log(`   - ${line}`);
        console.log('');
    }

    if (changes.length === 0) {
        console.log('✅ All preferred roles already point at correct accountId/code. Nothing to change.');
        if (alreadyOk.length) console.log(`   OK: ${alreadyOk.join(', ')}`);
        await cleanup();
        return;
    }

    console.log(`Found ${changes.length} role(s) to change:\n`);
    console.log(
        'Act'.padEnd(8) +
            'Role'.padEnd(28) +
            'Old Code'.padEnd(12) +
            '→ New'.padEnd(12) +
            'accountId change',
    );
    console.log('─'.repeat(100));
    for (const c of changes) {
        const marker = c.severity === 'high' ? '🔴' : c.severity === 'medium' ? '🟡' : '⚪';
        const idChange =
            c.oldAccountId === c.newAccountId
                ? 'snapshot only'
                : `${(c.oldAccountId ?? 'null').slice(0, 8)}… → ${c.newAccountId.slice(0, 8)}…`;
        console.log(
            `${marker} ${c.action.padEnd(6)} ${c.role.padEnd(26)} ${c.oldCode.padEnd(12)} → ${c.newCode.padEnd(10)} ${idChange}`,
        );
        console.log(`         ${c.oldName} → ${c.newName}`);
    }

    if (!isApply) {
        console.log(`\n🔍 DRY-RUN complete (zero writes).`);
        console.log(`   To apply: npx tsx scripts/apply-tenant-account-role-fixes.ts --tenant=${tenantArg} --apply`);
        console.log(`   Writes only TenantAccountRole on MAIN DB. Does not touch JournalLine.`);
        await cleanup();
        return;
    }

    // Backup current Melindo mappings before write
    const backupDir = path.join(process.cwd(), 'backups');
    try {
        mkdirSync(backupDir, { recursive: true });
    } catch {
        /* ignore */
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `tenant-account-role-${tenantArg}-before-${ts}.csv`);
    const csvHeader = 'id,tenantId,role,accountId,accountCode,accountName\n';
    const csvBody = current
        .map(
            (m) =>
                `${m.id},${m.tenantId},${m.role},${m.accountId},${m.accountCode ?? ''},${JSON.stringify(m.accountName ?? '')}`,
        )
        .join('\n');
    try {
        writeFileSync(backupPath, csvHeader + csvBody + '\n', 'utf8');
        console.log(`\n💾 Backup written: ${backupPath}`);
    } catch (e) {
        console.warn(`\n⚠️  Could not write backup file (${e}). Continuing with apply — consider manual dump.`);
    }

    console.log(`\n⏳ Applying ${changes.length} changes (TenantAccountRole only)...`);

    let applied = 0;
    for (const c of changes) {
        if (c.action === 'create') {
            await mainPrisma.tenantAccountRole.create({
                data: {
                    tenantId: tenant.id,
                    role: c.role,
                    accountId: c.newAccountId,
                    accountCode: c.newCode,
                    accountName: c.newName,
                },
            });
        } else {
            await mainPrisma.tenantAccountRole.update({
                where: { id: c.mappingId! },
                data: {
                    accountId: c.newAccountId,
                    accountCode: c.newCode,
                    accountName: c.newName,
                },
            });
        }
        applied++;
        console.log(`  ✓ ${c.action} ${c.role}: ${c.oldCode} → ${c.newCode} (accountId updated)`);
    }

    clearAccountCache();
    console.log(`\n✅ Applied ${applied} mapping fix(es). Account cache cleared.`);
    console.log(`📌 Verify: npx tsx scripts/audit-tenant-account-roles.ts --tenant=${tenantArg}`);
    console.log(`📌 Rollback: restore rows from ${backupPath} if needed.`);

    await cleanup();
}

async function cleanup() {
    await mainPrisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await mainPrisma.$disconnect();
    process.exit(1);
});
