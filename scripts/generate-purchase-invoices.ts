import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Generating Purchase Invoices for RECEIVED orders...');

    const pos = await prisma.purchaseOrder.findMany({
        where: {
            status: 'RECEIVED',
            invoices: { none: {} } // Only orders without invoices
        }
    });

    console.log(`Found ${pos.length} orders to process.`);

    for (const po of pos) {
        const invoiceNumber = `INV-${po.orderNumber}`;

        // Check if invoice already exists to avoid unique constraint errors
        const existing = await prisma.purchaseInvoice.findUnique({
            where: { invoiceNumber }
        });

        if (existing) {
            console.log(`Invoice ${invoiceNumber} already exists, skipping.`);
            continue;
        }

        // Set due date to order date to simulate aging
        const invoice = await prisma.purchaseInvoice.create({
            data: {
                invoiceNumber,
                purchaseOrderId: po.id,
                invoiceDate: po.orderDate,
                dueDate: po.orderDate, // Overdue since PO date
                totalAmount: po.totalAmount as any,
                paidAmount: 0,
                status: 'UNPAID'
            }
        });

        console.log(`Created invoice ${invoice.invoiceNumber} for PO ${po.orderNumber}`);
    }

    console.log('Finished generating invoices.');
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
