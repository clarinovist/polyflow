/**
 * Script: sync-standard-costs.ts
 * Tujuan: Sync standardCost dari buyPrice untuk variant yang belum punya standardCost.
 * Ini memastikan cost flow production (backflush) dapat menghitung COGM dengan benar.
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('=== Sync standardCost dari buyPrice ===\n');

    const variants = await prisma.productVariant.findMany({
        where: {
            product: { productType: { in: ['RAW_MATERIAL', 'INTERMEDIATE', 'FINISHED_GOOD', 'PACKAGING'] } },
            OR: [
                { standardCost: null },
                { standardCost: { equals: 0 } }
            ]
        },
        select: {
            id: true, name: true, buyPrice: true, standardCost: true,
            product: { select: { productType: true } }
        }
    });

    console.log(`Ditemukan ${variants.length} variants tanpa standardCost\n`);

    let updated = 0;
    let skipped = 0;

    for (const v of variants) {
        const buyPrice = Number(v.buyPrice ?? 0);

        if (buyPrice > 0) {
            await prisma.productVariant.update({
                where: { id: v.id },
                data: { standardCost: buyPrice }
            });
            console.log(`  ✅ ${v.product.productType} | ${v.name} → standardCost = ${buyPrice.toLocaleString()}`);
            updated++;
        } else {
            console.log(`  ⚠️  ${v.product.productType} | ${v.name} → buyPrice juga null/0, dilewati`);
            skipped++;
        }
    }

    console.log(`\n✅ Updated: ${updated} variants`);
    console.log(`⚠️  Skipped (no buyPrice): ${skipped} variants`);

    // Also sync inventory.averageCost for items that have standardCost but no averageCost
    console.log('\n--- Sync inventory.averageCost dari standardCost ---');
    const inventoryItems = await prisma.inventory.findMany({
        where: {
            OR: [
                { averageCost: null },
                { averageCost: { equals: 0 } }
            ],
            quantity: { gt: 0 }
        },
        select: {
            id: true, quantity: true, averageCost: true,
            productVariant: { select: { name: true, standardCost: true, buyPrice: true } }
        }
    });

    let invUpdated = 0;
    for (const inv of inventoryItems) {
        const cost = Number(inv.productVariant.standardCost ?? 0) || Number(inv.productVariant.buyPrice ?? 0);
        if (cost > 0) {
            await prisma.inventory.update({ where: { id: inv.id }, data: { averageCost: cost } });
            invUpdated++;
        }
    }
    console.log(`✅ Synced averageCost untuk ${invUpdated} inventory records`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
