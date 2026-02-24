import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const pos = await prisma.productionOrder.findMany({
        where: { salesOrderId: '23a9c188-a656-4c50-ab5c-fe6864823540' },
        include: {
            bom: { include: { productVariant: true } },
            parentOrder: true
        }
    });

    console.log(`\n============================`);
    const reservations = await prisma.stockReservation.findMany({
        where: { productVariant: { skuCode: { in: ['PKHUR001', 'PKHUR002', 'PKHUR003', 'PKHUR004'] } }, status: 'ACTIVE' },
        include: { productVariant: true }
    });

    for (const res of reservations) {
        console.log(`Reservation: ${res.productVariant.name} | Qty: ${res.quantity} | Ref: ${res.referenceId} | For: ${res.reservedFor}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
