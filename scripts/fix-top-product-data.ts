import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Adding test item to SO-2026-0001...');

    const orderId = '859c36f4-8ea5-4ad3-b869-1f647a23c7b0';
    const variantId = 'e0186b2d-742e-4526-8500-08a5ea4a0a44';

    const newItem = await prisma.salesOrderItem.create({
        data: {
            salesOrderId: orderId,
            productVariantId: variantId,
            quantity: 1,
            unitPrice: 31150000,
            subtotal: 31150000,
            discountPercent: 0
        }
    });

    console.log('Successfully added item:', newItem.id);
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
