/**
 * One-time script to fix Purchase Invoices that are DRAFT but should be UNPAID
 *
 * Run with: npx ts-node scripts/fix-draft-bills.ts
 */

import {
    PrismaClient,
    PurchaseInvoiceStatus,
    PurchaseOrderStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log(
        '🔍 Finding DRAFT Purchase Invoices for RECEIVED Purchase Orders...\n',
    );

    const draftInvoices = await prisma.purchaseInvoice.findMany({
        where: {
            status: PurchaseInvoiceStatus.DRAFT,
        },
        include: {
            purchaseOrder: true,
        },
    });

    console.log(`Found ${draftInvoices.length} DRAFT Purchase Invoices\n`);

    let updatedCount = 0;

    for (const invoice of draftInvoices) {
        const po = invoice.purchaseOrder;

        // Only update if PO is RECEIVED or PARTIAL_RECEIVED
        if (
            po.status === PurchaseOrderStatus.RECEIVED ||
            po.status === PurchaseOrderStatus.PARTIAL_RECEIVED
        ) {
            await prisma.purchaseInvoice.update({
                where: { id: invoice.id },
                data: { status: PurchaseInvoiceStatus.UNPAID },
            });

            console.log(
                `✅ Updated Invoice ${invoice.invoiceNumber} (PO: ${po.orderNumber}): DRAFT → UNPAID`,
            );
            updatedCount++;
        } else {
            console.log(
                `⏭️  Skipping Invoice ${invoice.invoiceNumber} - PO ${po.orderNumber} is ${po.status}`,
            );
        }
    }

    console.log(
        `\n✨ Done! Updated ${updatedCount} Purchase Invoices from DRAFT to UNPAID`,
    );
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
