/**
 * One-time script to fix Purchase Orders that have received goods but are still in DRAFT status
 * 
 * Run with: npx ts-node scripts/fix-po-status.ts
 */

import { PrismaClient, PurchaseOrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Finding Purchase Orders with received goods but DRAFT status...\n');

    const draftPOs = await prisma.purchaseOrder.findMany({
        where: {
            status: PurchaseOrderStatus.DRAFT
        },
        include: {
            items: true
        }
    });

    console.log(`Found ${draftPOs.length} DRAFT Purchase Orders\n`);

    let updatedCount = 0;

    for (const po of draftPOs) {
        if (po.items.length === 0) {
            console.log(`⏭️  Skipping PO ${po.orderNumber} - no items`);
            continue;
        }

        const allReceived = po.items.every(item =>
            item.receivedQty.toNumber() >= item.quantity.toNumber()
        );
        const partialReceived = po.items.some(item =>
            item.receivedQty.toNumber() > 0
        );

        let newStatus: PurchaseOrderStatus | null = null;

        if (allReceived) {
            newStatus = PurchaseOrderStatus.RECEIVED;
        } else if (partialReceived) {
            newStatus = PurchaseOrderStatus.PARTIAL_RECEIVED;
        }

        if (newStatus) {
            await prisma.purchaseOrder.update({
                where: { id: po.id },
                data: { status: newStatus }
            });

            console.log(`✅ Updated PO ${po.orderNumber}: DRAFT → ${newStatus}`);
            updatedCount++;
        } else {
            console.log(`⏭️  Skipping PO ${po.orderNumber} - no goods received yet`);
        }
    }

    console.log(`\n✨ Done! Updated ${updatedCount} Purchase Orders`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
