import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const sos = await prisma.salesOrder.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
            items: {
                include: {
                    productVariant: true
                }
            },
            productionOrders: true
        }
    });

    console.log(`\n=== RECENT SALES ORDERS ===`);
    for (const so of sos) {
        console.log(`\nSO: ${so.orderNumber} | Type: ${so.orderType} | Status: ${so.status}`);
        for (const item of so.items) {
            console.log(`  - Item: ${item.productVariant.name} | Qty: ${item.quantity}`);
        }
        if (so.productionOrders.length > 0) {
            console.log(`  - Generated WOs: ${so.productionOrders.map(wo => wo.orderNumber).join(', ')}`);
        } else {
            console.log(`  - Generated WOs: None`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
