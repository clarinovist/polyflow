const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const invoices = await prisma.invoice.findMany({
        select: { invoiceNumber: true, notes: true, status: true }
    });

    invoices.forEach(i => {
        console.log(`${i.invoiceNumber} [${i.status}]: ${i.notes}`);
    });

    const bills = await prisma.purchaseInvoice.findMany({
        select: { invoiceNumber: true, notes: true, status: true }
    });

    bills.forEach(b => {
        console.log(`${b.invoiceNumber} [${b.status}]: ${b.notes}`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
