/**
 * Soft-deactivate ghost accounts on Melindo (Kiyowo-style codes).
 *
 * Default: --dry-run. --apply to write.
 * Only deactivates accounts with 0 JournalLine entries (unless --force).
 *
 * Usage:
 *   npx tsx scripts/deactivate-ghost-accounts.ts --tenant=melindo --dry-run
 *   npx tsx scripts/deactivate-ghost-accounts.ts --tenant=melindo --apply
 */
import { PrismaClient } from '@prisma/client';

const mainPrisma = new PrismaClient();

const GHOST_CODES = ['11110', '11300', '11310', '11340', '11350', '51100'];

async function main() {
    const args = process.argv.slice(2);
    const isApply = args.includes('--apply');
    const tenantArg = args.find(a => a.startsWith('--tenant='))?.split('=')[1] || 'melindo';
    const force = args.includes('--force');

    console.log('=== Ghost Account Deactivation ===');
    console.log(`Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Tenant: ${tenantArg}`);
    console.log(`Force (ignore journal lines): ${force}\n`);

    const tenant = await mainPrisma.tenant.findFirst({ where: { subdomain: tenantArg } });
    if (!tenant) { console.error(`❌ Tenant "${tenantArg}" not found`); process.exit(1); }

    const tenantDb = new PrismaClient({ datasources: { db: { url: tenant.dbUrl } } });

    const candidates: Array<{ code: string; name: string; journalLineCount: number; safe: boolean }> = [];

    for (const code of GHOST_CODES) {
        const account = await tenantDb.account.findUnique({ where: { code }, select: { id: true, code: true, name: true, isActive: true } });
        if (!account || !account.isActive) continue;

        const lineCount = await tenantDb.journalLine.count({ where: { accountId: account.id } });
        candidates.push({ code: account.code, name: account.name, journalLineCount: lineCount, safe: lineCount === 0 });
    }

    if (candidates.length === 0) {
        console.log('✅ No ghost accounts found to deactivate.');
        await tenantDb.$disconnect();
        await mainPrisma.$disconnect();
        return;
    }

    console.log(`Found ${candidates.length} ghost candidates:\n`);
    for (const c of candidates) {
        const marker = c.safe ? '🟢' : '🔴';
        console.log(`  ${marker} ${c.code.padEnd(8)} ${c.name.padEnd(30)} ${c.journalLineCount} journal lines`);
    }

    const safeCount = candidates.filter(c => c.safe).length;
    const unsafeCount = candidates.filter(c => !c.safe).length;

    console.log(`\nSafe (0 lines): ${safeCount} | Unsafe (>0 lines): ${unsafeCount}`);

    if (!isApply) {
        console.log(`\n🔍 DRY-RUN complete. Run with --apply to deactivate.`);
        if (unsafeCount > 0 && !force) {
            console.log(`   Use --force to deactivate accounts with journal lines.`);
        }
        await tenantDb.$disconnect();
        await mainPrisma.$disconnect();
        return;
    }

    // Apply
    const toDeactivate = force ? candidates : candidates.filter(c => c.safe);
    if (toDeactivate.length === 0) {
        console.log('\nNo safe accounts to deactivate.');
        await tenantDb.$disconnect();
        await mainPrisma.$disconnect();
        return;
    }

    console.log(`\n⏳ Deactivating ${toDeactivate.length} accounts...`);
    for (const c of toDeactivate) {
        await tenantDb.account.update({ where: { code: c.code }, data: { isActive: false } });
        console.log(`  ✓ ${c.code} ${c.name}`);
    }

    console.log(`\n✅ Deactivated ${toDeactivate.length} ghost accounts.`);
    await tenantDb.$disconnect();
    await mainPrisma.$disconnect();
}

main().catch(console.error);
