import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function syncStatuses() {
    console.log('Syncing journal statuses with invoice statuses...');

    // 1. Purchase Invoices
    const purchaseInvoices = await prisma.purchaseInvoice.findMany({
        where: { status: 'DRAFT' },
        select: { id: true, invoiceNumber: true }
    });

    for (const pi of purchaseInvoices) {
        const postedJournal = await prisma.journalEntry.findFirst({
            where: {
                referenceId: pi.id,
                referenceType: 'PURCHASE_INVOICE',
                status: 'POSTED'
            }
        });

        if (postedJournal) {
            console.log(`Updating Purchase Invoice ${pi.invoiceNumber} to UNPAID because it has POSTED journal ${postedJournal.entryNumber}`);
            await prisma.purchaseInvoice.update({
                where: { id: pi.id },
                data: { status: 'UNPAID' }
            });
        }
    }

    // 2. Sales Invoices
    const salesInvoices = await prisma.invoice.findMany({
        where: { status: 'DRAFT' },
        select: { id: true, invoiceNumber: true }
    });

    for (const si of salesInvoices) {
        const postedJournal = await prisma.journalEntry.findFirst({
            where: {
                referenceId: si.id,
                referenceType: 'SALES_INVOICE',
                status: 'POSTED'
            }
        });

        if (postedJournal) {
            console.log(`Updating Sales Invoice ${si.invoiceNumber} to UNPAID because it has POSTED journal ${postedJournal.entryNumber}`);
            await prisma.invoice.update({
                where: { id: si.id },
                data: { status: 'UNPAID' }
            });
        }
    }

    console.log('Synchronization complete.');
}

syncStatuses()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
