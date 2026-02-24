import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const id = '23a9c188-a656-4c50-ab5c-fe6864823540';
    const order = await prisma.salesOrder.findUnique({
        where: { id },
        include: { items: true }
    });

    if (!order) return console.error("Sales Order not found");

    const shortages = [];
    for (const item of order.items) {
        const stock = await prisma.inventory.findUnique({
            where: {
                locationId_productVariantId: {
                    locationId: order.sourceLocationId || '',
                    productVariantId: item.productVariantId
                }
            }
        });

        const reservations = await prisma.stockReservation.aggregate({
            where: {
                locationId: order.sourceLocationId || '',
                productVariantId: item.productVariantId,
                status: 'ACTIVE',
                referenceId: { not: order.id }
            },
            _sum: { quantity: true }
        });
        const reservedQuantity = reservations._sum.quantity?.toNumber() || 0;

        const rawAvailable = stock ? Number(stock.quantity) : 0;
        const available = Math.max(0, rawAvailable - reservedQuantity);
        const required = Number(item.quantity);

        if (available < required) {
            shortages.push({
                productVariantId: item.productVariantId,
                required,
                available,
                shortage: required - available
            });
        }
    }

    console.log("Calculated Shortages:\n", JSON.stringify(shortages, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
