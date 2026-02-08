import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const orderNumber = 'SO-2026-0001';
    const order = await prisma.salesOrder.findUnique({
        where: { orderNumber },
        include: { items: true }
    });

    if (!order) {
        console.error('Order not found');
        return;
    }

    const itemsToAdd = [
        { variantId: '03178aa0-cda1-484c-b85c-60eb6386c606', name: 'HD Ungu', price: 1000000 },
        { variantId: '05f32ad0-c46a-4f7e-9e1e-ad3a0967b878', name: 'HD Merah', price: 800000 },
        { variantId: '0635d93b-ffbe-403d-8a05-bb2835cf4d73', name: 'Mixing HD Ungu Reguler', price: 1200000 },
        { variantId: '09d3fcd9-f40f-4ab9-94de-84520b805901', name: 'ROLL UNGU 24', price: 1500000 }
    ];

    for (const itemData of itemsToAdd) {
        // Check if item already exists
        const exists = order.items.some(i => i.productVariantId === itemData.variantId);
        if (exists) {
            console.log(`Item ${itemData.name} already exists in order, skipping.`);
            continue;
        }

        await prisma.salesOrderItem.create({
            data: {
                salesOrderId: order.id,
                productVariantId: itemData.variantId,
                quantity: 5,
                unitPrice: itemData.price,
                subtotal: itemData.price * 5,
                discountPercent: 0
            }
        });
        console.log(`Added ${itemData.name} to order ${orderNumber}`);
    }

    console.log('Finished populating items.');
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
