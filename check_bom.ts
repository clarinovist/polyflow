import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const boms = await prisma.bom.findMany({
        where: {
            productVariant: {
                name: {
                    contains: 'UNGU',
                    mode: 'insensitive'
                }
            }
        },
        include: {
            productVariant: true,
            items: {
                include: {
                    productVariant: true
                }
            }
        }
    });

    console.log(`\n=== BOMs FOR 'UNGU' ===`);
    for (const bom of boms) {
        console.log(`\nBOM: ${bom.name}`);
        console.log(`Target: ${bom.productVariant.name} (${bom.productVariant.skuCode}) - Unit: ${bom.productVariant.primaryUnit}`);
        console.log(`Output Qty: ${bom.outputQuantity}`);
        console.log(`Materials:`);
        for (const item of bom.items) {
            console.log(`  - ${item.productVariant.name} (${item.productVariant.skuCode}) | Qty: ${item.quantity} ${item.productVariant.primaryUnit}`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
