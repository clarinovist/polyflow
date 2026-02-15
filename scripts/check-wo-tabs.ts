
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Work Orders and their Product Types ---\n');

    const orders = await prisma.productionOrder.findMany({
        include: {
            bom: {
                include: {
                    productVariant: {
                        include: { product: true }
                    }
                }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
    });

    for (const order of orders) {
        const product = order.bom.productVariant.product;
        const bomCategory = order.bom.category;

        // Determine which tab this would appear in
        let tab = 'all';
        if (product.productType === 'INTERMEDIATE') tab = 'mixing';
        else if (['WIP', 'FINISHED_GOOD'].includes(product.productType)) tab = 'extrusion';
        else if (product.productType === 'PACKAGING') tab = 'packing';

        console.log(`${order.orderNumber} | Product: ${product.name} | Type: ${product.productType} | BOM Cat: ${bomCategory} | Tab: ${tab}`);
    }
}

main();
