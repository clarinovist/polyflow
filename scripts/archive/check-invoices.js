const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // In schema, Sales Invoices are in the 'Invoice' model
    const salesInvoices = await prisma.invoice.findMany({
        include: { salesOrder: true }
    });
    console.log('Sales Invoices:', salesInvoices.length);

    const purchaseInvoices = await prisma.purchaseInvoice.findMany({
        include: { purchaseOrder: true }
    });
    console.log('Purchase Invoices:', purchaseInvoices.length);

    if (salesInvoices.length > 0) {
        console.log('\nSample Sales Invoice:');
        const sample = salesInvoices[0];
        console.log(`- ID: ${sample.id}, Number: ${sample.invoiceNumber}, Status: ${sample.status}, Total: ${sample.totalAmount}`);
    }

    if (purchaseInvoices.length > 0) {
        console.log('\nSample Purchase Invoice:');
        const sample = purchaseInvoices[0];
        console.log(`- ID: ${sample.id}, Number: ${sample.invoiceNumber}, Status: ${sample.status}, Total: ${sample.totalAmount}`);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
