/**
 * Bulk set ProductVariant.revenueAccountId from CSV.
 *
 * CSV format: skuCode,revenueAccountCode
 * Example:
 *   RAF-SUPER-001,4-102
 *   SED-STERIL-001,4-114
 *
 * Usage:
 *   npx tsx scripts/bulk-set-variant-revenue.ts --file=data/variant-revenue.csv --dry-run
 *   npx tsx scripts/bulk-set-variant-revenue.ts --file=data/variant-revenue.csv --apply
 *   npx tsx scripts/bulk-set-variant-revenue.ts --file=data/variant-revenue.csv --tenant=melindo
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import path from 'path';

const mainPrisma = new PrismaClient();

function parseCSV(content: string): Array<{ skuCode: string; revenueAccountCode: string }> {
    const lines = content.trim().split('\n').filter(l => l.trim() && !l.startsWith('#'));
    return lines.map(line => {
        const [skuCode, revenueAccountCode] = line.split(',').map(s => s.trim());
        return { skuCode, revenueAccountCode };
    }).filter(r => r.skuCode && r.revenueAccountCode);
}

async function main() {
    const args = process.argv.slice(2);
    const isApply = args.includes('--apply');
    const fileArg = args.find(a => a.startsWith('--file='))?.split('=')[1];
    const tenantArg = args.find(a => a.startsWith('--tenant='))?.split('=')[1] || 'melindo';

    if (!fileArg) {
        console.error('Usage: --file=path/to/csv.csv [--apply] [--tenant=melindo]');
        process.exit(1);
    }

    console.log('=== Bulk Set Variant Revenue Account ===');
    console.log(`Mode: ${isApply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Tenant: ${tenantArg}`);
    console.log(`File: ${fileArg}\n`);

    // Find tenant
    const tenant = await mainPrisma.tenant.findFirst({ where: { subdomain: tenantArg } });
    if (!tenant) { console.error(`❌ Tenant "${tenantArg}" not found`); process.exit(1); }

    // Connect to tenant DB
    const tenantDb = new PrismaClient({ datasources: { db: { url: tenant.dbUrl } } });

    // Parse CSV
    const csvPath = path.resolve(fileArg);
    const csvContent = readFileSync(csvPath, 'utf-8');
    const rows = parseCSV(csvContent);
    console.log(`Parsed ${rows.length} rows from CSV\n`);

    let matched = 0, notFound = 0, accountNotFound = 0, alreadySet = 0;
    const changes: Array<{ sku: string; oldAccountId: string | null; newAccountId: string; newCode: string }> = [];

    for (const row of rows) {
        // Find variant by SKU
        const variant = await tenantDb.productVariant.findUnique({
            where: { skuCode: row.skuCode },
            select: { id: true, skuCode: true, name: true, revenueAccountId: true },
        });
        if (!variant) { notFound++; continue; }

        // Find account by code
        const account = await tenantDb.account.findUnique({
            where: { code: row.revenueAccountCode },
            select: { id: true, code: true, name: true, isActive: true },
        });
        if (!account || !account.isActive) { accountNotFound++; continue; }

        if (variant.revenueAccountId === account.id) { alreadySet++; continue; }

        matched++;
        changes.push({
            sku: variant.skuCode,
            oldAccountId: variant.revenueAccountId,
            newAccountId: account.id,
            newCode: account.code,
        });
    }

    // Print summary
    console.log(`Matched: ${matched} | Not found SKU: ${notFound} | Account missing: ${accountNotFound} | Already set: ${alreadySet}\n`);

    if (changes.length > 0) {
        console.log('Changes:');
        for (const c of changes.slice(0, 20)) {
            console.log(`  ${c.sku.padEnd(20)} ${c.oldAccountId ?? '(none)'.padEnd(12)} → ${c.newCode}`);
        }
        if (changes.length > 20) console.log(`  ... and ${changes.length - 20} more`);
    }

    if (!isApply) {
        console.log(`\n🔍 DRY-RUN complete. Run with --apply to write.`);
        await tenantDb.$disconnect();
        await mainPrisma.$disconnect();
        return;
    }

    // Apply
    console.log(`\n⏳ Applying ${changes.length} changes...`);
    for (const c of changes) {
        await tenantDb.productVariant.update({
            where: { id: c.sku },
            data: { revenueAccountId: c.newAccountId },
        });
    }
    // Note: update by id, not skuCode
    for (const c of changes) {
        await tenantDb.productVariant.updateMany({
            where: { skuCode: c.sku },
            data: { revenueAccountId: c.newAccountId },
        });
    }

    console.log(`\n✅ Applied ${changes.length} variant revenue mappings.`);
    await tenantDb.$disconnect();
    await mainPrisma.$disconnect();
}

main().catch(console.error);
