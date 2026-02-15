
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const packagingProducts = await prisma.product.findMany({
        where: { productType: 'PACKAGING' },
        select: { name: true, cogsAccountId: true, inventoryAccountId: true }
    });

    console.log('--- List of Current PACKAGING Items ---');
    packagingProducts.forEach((p, index) => {
        console.log(`${index + 1}. ${p.name} (Inv: ${p.inventoryAccountId}, COGS: ${p.cogsAccountId})`);
    });
}

main();
