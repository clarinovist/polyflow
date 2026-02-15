
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking for Misclassified Packaging Products ---');
    console.log('Criteria: Product Type = PACKAGING but has Sales History (Sold to Customer)\n');

    // 1. Get all products with type PACKAGING
    const packagingProducts = await prisma.product.findMany({
        where: { productType: 'PACKAGING' },
        include: {
            variants: {
                include: {
                    _count: {
                        select: { salesOrderItems: true }
                    }
                }
            }
        }
    });

    const suspiciousProducts = [];

    for (const product of packagingProducts) {
        let totalSales = 0;
        for (const variant of product.variants) {
            totalSales += variant._count.salesOrderItems;
        }

        if (totalSales > 0) {
            suspiciousProducts.push({
                name: product.name,
                id: product.id,
                salesCount: totalSales
            });
        }
    }

    if (suspiciousProducts.length === 0) {
        console.log('✅ CLEAN! No other Packaging products found with sales history.');
    } else {
        console.log(`⚠️ FOUND ${suspiciousProducts.length} SUSPICIOUS PRODUCTS:`);
        console.log('These products are marked as PACKAGING but are being SOLD. They probably should be FINISHED_GOOD.');
        suspiciousProducts.forEach(p => {
            console.log(`- ${p.name} (Sales Count: ${p.salesCount})`);
        });
    }

    console.log('\n--- Summary ---');
    console.log(`Total Packaging Products Checked: ${packagingProducts.length}`);
}

main();
