import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const inventories = await prisma.inventory.findMany({
        where: {
            productVariant: {
                name: {
                    contains: 'UNGU',
                    mode: 'insensitive'
                }
            },
            quantity: {
                gt: 0
            }
        },
        include: {
            productVariant: true,
            location: true
        },
        orderBy: {
            productVariant: {
                name: 'asc'
            }
        }
    });

    console.log(`\n=== INVENTORY LOCATIONS FOR 'UNGU' ===`);
    if (inventories.length === 0) {
        console.log(`No stock found.`);
    } else {
        for (const inv of inventories) {
            console.log(`- Product: ${inv.productVariant.name} (SKU: ${inv.productVariant.skuCode})`);
            console.log(`  Location: ${inv.location.name} (ID: ${inv.locationId})`);
            console.log(`  Quantity: ${inv.quantity}`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
