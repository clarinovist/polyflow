const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const salesInvoices = await prisma.invoice.findMany({
        select: { invoiceNumber: true, createdAt: true }
    });
    console.log('Sales Invoices:');
    salesInvoices.forEach(i => console.log(`- ${i.invoiceNumber}: ${i.createdAt.toISOString()}`));

    const purchaseInvoices = await prisma.purchaseInvoice.findMany({
        select: { invoiceNumber: true, createdAt: true }
    });
    console.log('\nPurchase Invoices:');
    purchaseInvoices.forEach(i => console.log(`- ${i.invoiceNumber}: ${i.createdAt.toISOString()}`));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
