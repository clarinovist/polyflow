import { PrismaClient, ReferenceType } from '@prisma/client';
import { AutoJournalService } from '../src/services/finance/auto-journal-service';

const prisma = new PrismaClient();

async function sync() {
    console.log('--- Starting Invoice to GL Synchronization ---');

    // 1. Sync Sales Invoices
    console.log('\n[SALES] Syncing Sales Invoices...');
    const invoices = await prisma.invoice.findMany({
        select: { id: true, invoiceNumber: true }
    });

    let sCreated = 0, sSkipped = 0, sError = 0;

    for (const inv of invoices) {
        try {
            const existingJE = await prisma.journalEntry.findFirst({
                where: {
                    referenceType: ReferenceType.SALES_INVOICE,
                    referenceId: inv.id
                }
            });

            if (existingJE) {
                sSkipped++;
                continue;
            }

            console.log(`[SYNC] Sales Invoice ${inv.invoiceNumber} missing journal. Creating...`);
            await AutoJournalService.handleSalesInvoiceCreated(inv.id);
            sCreated++;
        } catch (error) {
            console.error(`[ERROR] Sales ${inv.invoiceNumber}:`, error);
            sError++;
        }
    }

    // 2. Sync Purchase Invoices
    console.log('\n[PURCHASE] Syncing Purchase Invoices...');
    const pInvoices = await prisma.purchaseInvoice.findMany({
        select: { id: true, invoiceNumber: true }
    });

    let pCreated = 0, pSkipped = 0, pError = 0;

    for (const inv of pInvoices) {
        try {
            const existingJE = await prisma.journalEntry.findFirst({
                where: {
                    referenceType: ReferenceType.PURCHASE_INVOICE,
                    referenceId: inv.id
                }
            });

            if (existingJE) {
                pSkipped++;
                continue;
            }

            console.log(`[SYNC] Purchase Invoice ${inv.invoiceNumber} missing journal. Creating...`);
            await AutoJournalService.handlePurchaseInvoiceCreated(inv.id);
            pCreated++;
        } catch (error) {
            console.error(`[ERROR] Purchase ${inv.invoiceNumber}:`, error);
            pError++;
        }
    }

    console.log('\n--- Sync Results ---');
    console.log(`Sales    - Created: ${sCreated}, Skipped: ${sSkipped}, Errors: ${sError}`);
    console.log(`Purchase - Created: ${pCreated}, Skipped: ${pSkipped}, Errors: ${pError}`);

    await prisma.$disconnect();
}

sync().catch(console.error);
