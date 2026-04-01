import { PrismaClient, SalesOrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const orderNumber = 'SO-2026-0010';
    console.log(`Starting void process for ${orderNumber}`);

    const order = await prisma.salesOrder.findUnique({
        where: { orderNumber },
        include: { items: true, movements: true, invoices: true, deliveryOrders: true }
    });

    if (!order) {
        console.error("Order not found");
        return;
    }

    if (order.status === SalesOrderStatus.CANCELLED) {
        console.log("Order is already cancelled.");
        return;
    }

    console.log(`Found order ${order.id} with status ${order.status}`);

    await prisma.$transaction(async (tx) => {
        // 1. Cancel related Delivery Orders
        for (const doRecord of order.deliveryOrders) {
            console.log(`Cancelling Delivery Order ${doRecord.orderNumber}`);
            await tx.deliveryOrder.update({
                where: { id: doRecord.id },
                data: { status: 'CANCELLED' }
            });
        }

        // 2. Cancel related Invoices
        for (const invoice of order.invoices) {
            console.log(`Cancelling Invoice ${invoice.invoiceNumber}`);
            await tx.invoice.update({
                where: { id: invoice.id },
                data: { status: 'CANCELLED' }
            });
        }

        // 3. Revert Stock Movements and Inventory
        const outMovements = order.movements.filter(m => m.type === 'OUT');
        console.log(`Found ${outMovements.length} OUT movements to revert`);

        for (const movement of outMovements) {
            if (!movement.fromLocationId) continue;

            console.log(`Reverting ${movement.quantity} of ${movement.productVariantId} to location ${movement.fromLocationId}`);

            // Add back to inventory
            await tx.inventory.update({
                where: {
                    locationId_productVariantId: {
                        locationId: movement.fromLocationId,
                        productVariantId: movement.productVariantId
                    }
                },
                data: {
                    quantity: { increment: movement.quantity }
                }
            });

            // Create compensating movement
            await tx.stockMovement.create({
                data: {
                    type: 'ADJUSTMENT',
                    productVariantId: movement.productVariantId,
                    toLocationId: movement.fromLocationId,
                    quantity: movement.quantity,
                    salesOrderId: order.id,
                    reference: `Void revert for ${order.orderNumber}`,
                    createdAt: new Date()
                }
            });
        }

        // 4. Mark Sales Order as Cancelled
        console.log(`Marking Sales Order ${orderNumber} as CANCELLED`);
        await tx.salesOrder.update({
            where: { id: order.id },
            data: { status: SalesOrderStatus.CANCELLED }
        });

        console.log('Void process completed successfully inside transaction.');
    });
}

main()
    .then(() => {
        console.log("Done.");
        process.exit(0);
    })
    .catch((e) => {
        console.error("Error during void process:", e);
        process.exit(1);
    });
