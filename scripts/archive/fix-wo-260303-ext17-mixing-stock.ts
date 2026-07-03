/**
 * One-time Data Repair Script
 * WO-260303-EXT17 — Mixing Area Stock Under-Deduction
 *
 * Bug: Affal (scrapProngkolQty + scrapDaunQty) was not included in the
 *      backflush calculation. Only good output was deducted from Mixing Area,
 *      so 32.5 Kg of affal was never consumed from stock.
 *
 * Fix: Deducts the missed affal quantity from Mixing Area inventory and
 *      creates a corrective OUT stock movement for audit trail.
 *
 * Run from project root:
 *   npx tsx scripts/fix-wo-260303-ext17-mixing-stock.ts
 */

import { PrismaClient, MovementType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const ORDER_NUMBER = 'WO-260303-EXT17';
    const MIXING_SLUG = 'mixing_area';

    // 1. Find the production order
    const order = await prisma.productionOrder.findFirst({
        where: { orderNumber: ORDER_NUMBER },
        include: {
            bom: { include: { items: true } },
            plannedMaterials: true
        }
    });

    if (!order) {
        console.error(`❌ Order ${ORDER_NUMBER} not found!`);
        return;
    }
    console.log(`✔ Found order: ${order.id} — ${order.orderNumber}`);

    // 2. Find the Mixing Area location
    const mixingLoc = await prisma.location.findUnique({
        where: { slug: MIXING_SLUG }
    });

    if (!mixingLoc) {
        console.error(`❌ Mixing Area location (slug: ${MIXING_SLUG}) not found!`);
        return;
    }
    console.log(`✔ Mixing Area: ${mixingLoc.id} — ${mixingLoc.name}`);

    // 3. Check executions and calculate total missed affal
    const executions = await prisma.productionExecution.findMany({
        where: { productionOrderId: order.id }
    });

    let totalMissedAffal = 0;
    for (const e of executions) {
        const prongkol = e.scrapProngkolQty ? Number(e.scrapProngkolQty) : 0;
        const daun = e.scrapDaunQty ? Number(e.scrapDaunQty) : 0;
        totalMissedAffal += prongkol + daun;
        console.log(`  Execution ${e.id}: prongkol=${prongkol}, daun=${daun}`);
    }

    console.log(`\nTotal missed affal to deduct: ${totalMissedAffal} Kg`);

    if (totalMissedAffal <= 0) {
        console.log('Nothing to deduct. Exiting.');
        return;
    }

    // 4. Determine BOM items and ratio
    const itemsToBackflush = order.plannedMaterials.length > 0
        ? order.plannedMaterials
        : (order.bom?.items || []);
    const isUsingPlanned = order.plannedMaterials.length > 0;

    if (itemsToBackflush.length === 0) {
        console.error('❌ No BOM items found to backflush against.');
        return;
    }

    // 5. Apply correction in a transaction
    await prisma.$transaction(async (tx) => {
        for (const item of itemsToBackflush) {
            let ratio = 0;
            if (isUsingPlanned) {
                ratio = Number(item.quantity) / Number(order.plannedQuantity);
            } else {
                ratio = Number(item.quantity) / Number(order.bom!.outputQuantity);
            }

            const qtyToDeduct = totalMissedAffal * ratio;
            if (qtyToDeduct < 0.0001) continue;

            console.log(`\nDeducting ${qtyToDeduct.toFixed(4)} Kg from Mixing Area`);
            console.log(`  Variant: ${item.productVariantId}`);

            await tx.inventory.update({
                where: {
                    locationId_productVariantId: {
                        locationId: mixingLoc.id,
                        productVariantId: item.productVariantId
                    }
                },
                data: { quantity: { decrement: qtyToDeduct } }
            });

            await tx.stockMovement.create({
                data: {
                    type: MovementType.OUT,
                    productVariantId: item.productVariantId,
                    fromLocationId: mixingLoc.id,
                    quantity: qtyToDeduct,
                    reference: `CORRECTION: Missed Affal Backflush WO#${order.orderNumber}`,
                    productionOrderId: order.id
                }
            });
        }
    });

    console.log(`\n✅ Done! Mixing Area stock corrected. Deducted ${totalMissedAffal} Kg total affal.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
