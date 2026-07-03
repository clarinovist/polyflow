// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkLedger() {
    const sku = 'INMIX001';
    const productVariant = await prisma.productVariant.findUnique({
        where: { skuCode: sku },
        include: {
            inventories: {
                include: { location: true }
            }
        }
    });

    if (!productVariant) {
        console.log(`Product variant with SKU ${sku} not found.`);
        return;
    }

    console.log(`Product: ${productVariant.name} (${productVariant.skuCode})`);
    console.log('Current Inventory:');
    productVariant.inventories.forEach(inv => {
        console.log(`- Location: ${inv.location.name} (${inv.location.slug}), Qty: ${inv.quantity}`);
    });

    const movements = await prisma.stockMovement.findMany({
        where: { productVariantId: productVariant.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
            fromLocation: true,
            toLocation: true,
            productionOrder: true
        }
    });

    console.log('\nRecent Stock Movements (Last 50):');
    movements.forEach(m => {
        const from = m.fromLocation ? m.fromLocation.name : 'N/A';
        const to = m.toLocation ? m.toLocation.name : 'N/A';
        const ref = m.reference || (m.productionOrder ? m.productionOrder.orderNumber : 'N/A');
        console.log(`[${m.createdAt.toISOString()}] Type: ${m.type}, Qty: ${m.quantity}, From: ${from}, To: ${to}, Ref: ${ref}`);
    });
}

checkLedger()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
