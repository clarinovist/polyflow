/**
 * Coverage report: % of variants / SO lines / invoice value with non-default revenue.
 *
 * Usage:
 *   npx tsx scripts/revenue-coverage-report.ts --tenant=melindo
 *   npx tsx scripts/revenue-coverage-report.ts --tenant=kiyowo
 */
import { PrismaClient } from '@prisma/client';

const mainPrisma = new PrismaClient();

async function main() {
    const tenantArg = process.argv.find(a => a.startsWith('--tenant='))?.split('=')[1] || 'melindo';

    console.log('=== Revenue Coverage Report ===');
    console.log(`Tenant: ${tenantArg}\n`);

    const tenant = await mainPrisma.tenant.findFirst({ where: { subdomain: tenantArg } });
    if (!tenant) { console.error(`❌ Tenant "${tenantArg}" not found`); process.exit(1); }

    const tenantDb = new PrismaClient({ datasources: { db: { url: tenant.dbUrl } } });

    // 1. Variant coverage
    const totalVariants = await tenantDb.productVariant.count();
    const mappedVariants = await tenantDb.productVariant.count({
        where: { revenueAccountId: { not: null } },
    });
    const variantPct = totalVariants > 0 ? (mappedVariants / totalVariants * 100).toFixed(1) : '0';

    console.log(`--- Variant Coverage ---`);
    console.log(`Total variants:    ${totalVariants}`);
    console.log(`With revenue:      ${mappedVariants}`);
    console.log(`Coverage:          ${variantPct}%`);

    // 2. Product coverage
    const totalProducts = await tenantDb.product.count();
    const mappedProducts = await tenantDb.product.count({
        where: { revenueAccountId: { not: null } },
    });
    const productPct = totalProducts > 0 ? (mappedProducts / totalProducts * 100).toFixed(1) : '0';

    console.log(`\n--- Product Coverage ---`);
    console.log(`Total products:    ${totalProducts}`);
    console.log(`With revenue:      ${mappedProducts}`);
    console.log(`Coverage:          ${productPct}%`);

    // 3. Recent SO item coverage (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const recentSOItems = await tenantDb.salesOrderItem.count({
        where: { salesOrder: { orderDate: { gte: ninetyDaysAgo } } },
    });

    const recentSOItemsWithVariantRevenue = await tenantDb.salesOrderItem.count({
        where: {
            salesOrder: { orderDate: { gte: ninetyDaysAgo } },
            productVariant: { revenueAccountId: { not: null } },
        },
    });

    const recentSOItemsWithProductRevenue = await tenantDb.salesOrderItem.count({
        where: {
            salesOrder: { orderDate: { gte: ninetyDaysAgo } },
            productVariant: {
                product: { revenueAccountId: { not: null } },
                revenueAccountId: null, // Only count if variant doesn't have override
            },
        },
    });

    const soLinePct = recentSOItems > 0
        ? ((recentSOItemsWithVariantRevenue + recentSOItemsWithProductRevenue) / recentSOItems * 100).toFixed(1)
        : '0';

    console.log(`\n--- Recent SO Line Coverage (last 90 days) ---`);
    console.log(`Total SO lines:   ${recentSOItems}`);
    console.log(`Variant override: ${recentSOItemsWithVariantRevenue}`);
    console.log(`Product override: ${recentSOItemsWithProductRevenue}`);
    console.log(`Total mapped:     ${recentSOItemsWithVariantRevenue + recentSOItemsWithProductRevenue}`);
    console.log(`Coverage:         ${soLinePct}%`);

    // 4. Top unmapped variants
    const unmapped = await tenantDb.productVariant.findMany({
        where: { revenueAccountId: null },
        select: { skuCode: true, name: true, product: { select: { name: true } } },
        take: 10,
    });

    if (unmapped.length > 0) {
        console.log(`\n--- Top Unmapped Variants (sample) ---`);
        for (const v of unmapped) {
            console.log(`  ${v.skuCode.padEnd(20)} ${v.name.padEnd(25)} (${v.product.name})`);
        }
        if (totalVariants - mappedVariants > 10) {
            console.log(`  ... and ${totalVariants - mappedVariants - 10} more`);
        }
    }

    await tenantDb.$disconnect();
    await mainPrisma.$disconnect();
}

main().catch(console.error);
