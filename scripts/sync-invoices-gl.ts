
import { PrismaClient, ReferenceType } from '@prisma/client';
import { AutoJournalService } from '../src/services/finance/auto-journal-service';

const prisma = new PrismaClient();

async function sync() {
    console.log('--- Starting Invoice to GL Synchronization ---');

    // 1. Find all invoices
    const invoices = await prisma.invoice.findMany({
        select: { id: true, invoiceNumber: true }
    });

    console.log(`Found ${invoices.length} invoices in system.`);

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const inv of invoices) {
        try {
            // Check if journal entry already exists for this invoice
            const existingJE = await prisma.journalEntry.findFirst({
                where: {
                    referenceType: ReferenceType.SALES_INVOICE,
                    referenceId: inv.id
                }
            });

            if (existingJE) {
                console.log(`[SKIP] Invoice ${inv.invoiceNumber} already has journal entry ${existingJE.entryNumber}`);
                skippedCount++;
                continue;
            }

            console.log(`[SYNC] Invoice ${inv.invoiceNumber} is missing journal entry. Creating now...`);

            // Trigger auto-journaling logic
            await AutoJournalService.handleSalesInvoiceCreated(inv.id);

            console.log(`[SUCCESS] Created journal entry for ${inv.invoiceNumber}`);
            createdCount++;
        } catch (error) {
            console.error(`[ERROR] Failed to sync ${inv.invoiceNumber}:`, error instanceof Error ? error.message : error);
            errorCount++;
        }
    }

    console.log('\n--- Sync Results ---');
    console.log(`Created: ${createdCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors:  ${errorCount}`);

    await prisma.$disconnect();
}

sync().catch(console.error);
