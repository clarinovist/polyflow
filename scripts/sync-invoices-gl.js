const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Starting Invoice to Journal Entry Synchronization ---');

    // 1. Find all Invoices that are NOT DRAFT or CANCELLED
    const invoices = await prisma.invoice.findMany({
        where: {
            status: { in: ['UNPAID', 'PAID', 'OVERDUE'] }
        },
        select: {
            id: true,
            invoiceNumber: true,
            status: true
        }
    });

    console.log(`Found ${invoices.length} finalized invoices to check.`);

    let updatedCount = 0;

    for (const invoice of invoices) {
        // 2. Find the corresponding Journal Entry
        // Based on existing logic, the Journal Entry referenceId is the Invoice ID
        const journal = await prisma.journalEntry.findFirst({
            where: {
                referenceId: invoice.id
            }
        });

        if (journal && journal.status === 'DRAFT') {
            await prisma.journalEntry.update({
                where: { id: journal.id },
                data: { status: 'POSTED' }
            });
            console.log(`[UPDATED] Invoice ${invoice.invoiceNumber}: Journal Entry set to POSTED`);
            updatedCount++;
        }
    }

    console.log(`--- Synchronization Complete. Updated ${updatedCount} Journal Entries to POSTED. ---`);
}

main()
    .catch(e => {
        console.error('Error during synchronization:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
