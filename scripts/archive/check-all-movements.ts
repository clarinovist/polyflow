import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const orderNumber = 'WO-260207-MIX99';

    // Find movements that mention this order in reference
    const movements = await prisma.stockMovement.findMany({
        where: {
            reference: { contains: orderNumber }
        },
        include: {
            productVariant: true,
            fromLocation: true,
            toLocation: true
        },
        orderBy: { createdAt: 'desc' }
    });

    console.log(`--- Stock Movements for ${orderNumber} ---`);
    if (movements.length === 0) {
        console.log('No movements found.');
        return;
    }

    movements.forEach((m: any) => {
        console.log(`- ${m.createdAt.toISOString()} | ${m.type.padEnd(10)} | ${m.productVariant.skuCode.padEnd(10)} | ${m.productVariant.name.padEnd(20)} | Qty: ${m.quantity} ${m.productVariant.primaryUnit}`);
        console.log(`  From: ${m.fromLocation?.name || 'EXTERNAL'} -> To: ${m.toLocation?.name || 'EXTERNAL'}`);
        console.log(`  Reference: ${m.reference || '-'}`);
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
