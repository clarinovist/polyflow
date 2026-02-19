
/**
 * Data Correction Script: Fix Inventory Account Mapping for Products
 * 
 * Problems found:
 * 1. PACKAGING products are mapped to account 11210 (Trade Receivables) instead of 11340 (Packaging Materials)
 * 2. Other product types may have missing inventoryAccountId
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Data Correction: Fix Product inventoryAccountId ---\n');

    // 1. Get the correct account IDs for each product type
    const accounts = await prisma.account.findMany({
        where: { code: { in: ['11310', '11320', '11330', '11340', '11350'] } },
        select: { id: true, code: true, name: true }
    });

    const accountMap = new Map(accounts.map(a => [a.code, a]));
    console.log('Available inventory accounts:');
    accounts.forEach(a => console.log(`  ${a.code} - ${a.name} (${a.id})`));

    const rawMatAcct = accountMap.get('11310');
    const wipAcct = accountMap.get('11320');
    const fgAcct = accountMap.get('11330');
    const pkgAcct = accountMap.get('11340');
    const scrapAcct = accountMap.get('11350');

    if (!rawMatAcct || !wipAcct || !fgAcct || !pkgAcct) {
        console.error('\nERROR: One or more required accounts not found!');
        process.exit(1);
    }

    const tradeReceivables = await prisma.account.findUnique({ where: { code: '11210' } });
    const wrongAccount12400 = await prisma.account.findUnique({ where: { code: '12400' } });

    // 2. Fix PACKAGING products incorrectly mapped to 11210 (Trade Receivables)
    if (tradeReceivables) {
        const packagingWithWrongAccount = await prisma.product.findMany({
            where: {
                productType: 'PACKAGING',
                inventoryAccountId: tradeReceivables.id
            },
            select: { id: true, name: true, inventoryAccountId: true }
        });

        console.log(`\nPACKAGING products with wrong account (11210): ${packagingWithWrongAccount.length}`);
        if (packagingWithWrongAccount.length > 0) {
            const updateResult = await prisma.product.updateMany({
                where: {
                    productType: 'PACKAGING',
                    inventoryAccountId: tradeReceivables.id
                },
                data: { inventoryAccountId: pkgAcct.id }
            });
            console.log(`  ✅ Fixed ${updateResult.count} PACKAGING products → 11340 (${pkgAcct.name})`);
        }
    }

    // 3. Fix products mapped to wrong accounts by product type
    const typeToAccount: Record<string, string> = {
        'RAW_MATERIAL': rawMatAcct.id,
        'WIP': wipAcct.id,
        'INTERMEDIATE': wipAcct.id,
        'FINISHED_GOOD': fgAcct.id,
        'PACKAGING': pkgAcct.id,
        'SCRAP': scrapAcct?.id ?? '',
    };

    console.log('\n--- Checking for products with missing inventoryAccountId ---');
    for (const [type, accountId] of Object.entries(typeToAccount)) {
        if (!accountId) {
            console.log(`  SKIP: ${type} - no account found`);
            continue;
        }

        const missingCount = await prisma.product.count({
            where: {
                productType: type as never,
                inventoryAccountId: null
            }
        });

        if (missingCount > 0) {
            await prisma.product.updateMany({
                where: {
                    productType: type as never,
                    inventoryAccountId: null
                },
                data: { inventoryAccountId: accountId }
            });
            console.log(`  ✅ ${type}: Set inventoryAccountId for ${missingCount} products`);
        } else {
            console.log(`  ✓ ${type}: All products have inventoryAccountId set`);
        }
    }

    // 4. Fix any WIP products mapped to account 12400
    if (wrongAccount12400) {
        const wipWith12400 = await prisma.product.count({
            where: { inventoryAccountId: wrongAccount12400.id }
        });
        if (wipWith12400 > 0) {
            const updateResult = await prisma.product.updateMany({
                where: { inventoryAccountId: wrongAccount12400.id },
                data: { inventoryAccountId: wipAcct.id }
            });
            console.log(`\n  ✅ Fixed ${updateResult.count} products mapped to 12400 → 11320 (WIP)`);
        } else {
            console.log('\n  ✓ No products incorrectly mapped to account 12400');
        }
    }

    // 5. Report final state
    console.log('\n--- Final Product Account Summary ---');
    const allProducts = await prisma.product.groupBy({
        by: ['productType'],
        _count: { id: true }
    });

    for (const row of allProducts) {
        const withAccount = await prisma.product.count({
            where: { productType: row.productType, inventoryAccountId: { not: null } }
        });
        console.log(`  ${row.productType}: ${withAccount}/${row._count.id} mapped`);
    }

    await prisma.$disconnect();
    console.log('\n✅ Done!');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
