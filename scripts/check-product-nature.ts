
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const productName = 'HD TRANS REGULER';
    console.log(`--- Investigating Nature of Product: "${productName}" ---`);

    const product = await prisma.product.findFirst({
        where: { name: productName },
        include: {
            variants: true
        }
    });

    if (!product) {
        console.log('Product not found.');
        return;
    }

    console.log(`ID: ${product.id}`);
    console.log(`Type: ${product.type}`);

    if (product.variants.length === 0) {
        console.log("No variants found.");
        return;
    }

    const variantId = product.variants[0].id;
    console.log(`Using Variant ID: ${variantId}`);

    // Check if it has a BOM where it is the output
    const boms = await prisma.bom.findMany({
        where: { productVariantId: variantId }
    });

    if (boms.length > 0) {
        console.log(`Found ${boms.length} BOMs for this product.`);

        const bomIds = boms.map(b => b.id);
        const productionOrders = await prisma.productionOrder.findMany({
            where: { bomId: { in: bomIds } },
            take: 5
        });

        if (productionOrders.length > 0) {
            console.log(`Found ${productionOrders.length} Production Orders. Example:`);
            productionOrders.forEach(po => console.log(`- PO: ${po.orderNumber}`));
            console.log("CONCLUSION: It is MANUFACTURED.");
        } else {
            console.log("Has BOM but no Production Orders found.");
        }
    } else {
        console.log("No BOM found for this product (Not Manufactured).");
    }

    // console.log(`\n--- Production History (Direct) ---`);
    // NOTE: ProductionOrder does not have direct productVariantId, it links via BOM.
    // So the BOM check above is sufficient.

    /*
    if (productionOrders.length > 0) {
        console.log(`Found ${productionOrders.length} Production Orders for this product. Example:`);
        productionOrders.forEach(po => console.log(`- PO: ${po.orderNumber}`));
        console.log("CONCLUSION: It is MANUFACTURED.");
    } else {
        console.log("No Production Orders found.");
    }
    */

    console.log(`\n--- Purchase History ---`);
    // Check if it has ever been purchased
    const purchaseItems = await prisma.purchaseOrderItem.findMany({
        where: { productVariantId: variantId },
        include: { purchaseOrder: true },
        take: 5
    });

    if (purchaseItems.length > 0) {
        console.log(`Found ${purchaseItems.length} Purchase Orders. Example:`);
        purchaseItems.forEach(pi => console.log(`- PO: ${pi.purchaseOrder.orderNumber} | Qty: ${pi.quantity}`));
        console.log("CONCLUSION: It is PURCHASED.");
    } else {
        console.log("No Purchase Orders found.");
    }
}

main();
