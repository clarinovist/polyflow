
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const skus = ['CSPE', 'UNGU JUMBO', 'AGUNGTEX'];
    // CSPE (suspect RM), UNGU JUMBO (suspect FG), AGUNGTEX (?)

    console.log(`Checking Product Types for: ${skus.join(', ')}`);

    const variants = await prisma.productVariant.findMany({
        where: {
            OR: [
                { name: { in: skus } },
                { skuCode: { in: skus } } // Check likely sku codes too if names don't match exactly
            ]
        },
        include: { product: true }
    });

    if (variants.length === 0) {
        console.log('No matching products found.');
    } else {
        variants.forEach(v => {
            console.log(`Name: ${v.name} | SKU: ${v.skuCode} | Type: ${v.product.productType}`);
        });
    }
}

main();
