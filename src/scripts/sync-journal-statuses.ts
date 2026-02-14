import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncStatuses() {
    console.log('Syncing journal statuses with invoice statuses...');

    // 1. Purchase Invoices
    const purchaseInvoices = await prisma.purchaseInvoice.findMany({
        select: { id: true, status: true, invoiceNumber: true }
    });

    for (const pi of purchaseInvoices) {
        if (pi.status === 'DRAFT') {
            const jes = await prisma.journalEntry.findMany({
                where: {
                    referenceId: pi.id,
                    referenceType: 'PURCHASE_INVOICE',
                    status: 'POSTED'
                }
            });
            for (const je of jes) {
                console.log(`Updating JE ${je.entryNumber} to DRAFT because invoice ${pi.invoiceNumber} is DRAFT`);
                await prisma.journalEntry.update({
                    where: { id: je.id },
                    data: { status: 'DRAFT' }
                });
            }
        }
    }

    // 2. Sales Invoices
    const salesInvoices = await prisma.invoice.findMany({
        select: { id: true, status: true, invoiceNumber: true }
    });

    for (const si of salesInvoices) {
        if (si.status === 'DRAFT') {
            const jes = await prisma.journalEntry.findMany({
                where: {
                    referenceId: si.id,
                    referenceType: 'SALES_INVOICE',
                    status: 'POSTED'
                }
            });
            for (const je of jes) {
                console.log(`Updating JE ${je.entryNumber} to DRAFT because invoice ${si.invoiceNumber} is DRAFT`);
                await prisma.journalEntry.update({
                    where: { id: je.id },
                    data: { status: 'DRAFT' }
                });
            }
        }
    }

    console.log('Synchronization complete.');
}

syncStatuses()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
