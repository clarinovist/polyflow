
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * PURGE OPENING BALANCES SCRIPT
 * DANGER: This script deletes ALL records created by the Opening Balance Wizard.
 * Use this to reset the system if you have orphaned or duplicate opening entries.
 */
async function run() {
    console.log('--- STARTING COMPREHENSIVE PURGE OF OPENING BALANCES ---');

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Identify all SO/PO placeholders
            const sos = await tx.salesOrder.findMany({ where: { orderNumber: { startsWith: 'SO-OPEN-' } } });
            const pos = await tx.purchaseOrder.findMany({ where: { orderNumber: { startsWith: 'PO-OPEN-' } } });

            console.log(`Found ${sos.length} Opening Sales Orders and ${pos.length} Opening Purchase Orders.`);

            // 2. Identify all related Invoices and Bills
            const invoices = await tx.invoice.findMany({ where: { salesOrderId: { in: sos.map(s => s.id) } } });
            const purchaseInvoices = await tx.purchaseInvoice.findMany({ where: { purchaseOrderId: { in: pos.map(p => p.id) } } });

            const invoiceIds = invoices.map(i => i.id);
            const purchaseInvoiceIds = purchaseInvoices.map(i => i.id);

            console.log(`Found ${invoiceIds.length} AR Invoices and ${purchaseInvoiceIds.length} AP Bills.`);

            // 3. Delete Journal Entries
            // We look for JournalEntries referenced by these invoices, or matching description patterns
            const journalEntries = await tx.journalEntry.findMany({
                where: {
                    OR: [
                        { referenceId: { in: [...invoiceIds, ...purchaseInvoiceIds] } },
                        { description: { contains: 'Opening Balance' } }
                    ]
                }
            });

            if (journalEntries.length > 0) {
                const jeIds = journalEntries.map(je => je.id);
                await tx.journalLine.deleteMany({ where: { journalEntryId: { in: jeIds } } });
                await tx.journalEntry.deleteMany({ where: { id: { in: jeIds } } });
                console.log(`Deleted ${jeIds.length} Journal Entries.`);
            }

            // 4. Delete Invoices & Bills
            if (purchaseInvoiceIds.length > 0) {
                await tx.purchasePayment.deleteMany({ where: { purchaseInvoiceId: { in: purchaseInvoiceIds } } });
                await tx.purchaseInvoice.deleteMany({ where: { id: { in: purchaseInvoiceIds } } });
            }
            if (invoiceIds.length > 0) {
                await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
                await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
            }

            // 5. Delete Orders
            if (pos.length > 0) {
                await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: pos.map(p => p.id) } } });
                await tx.purchaseOrder.deleteMany({ where: { id: { in: pos.map(p => p.id) } } });
            }
            if (sos.length > 0) {
                await tx.salesOrderItem.deleteMany({ where: { salesOrderId: { in: sos.map(s => s.id) } } });
                await tx.salesOrder.deleteMany({ where: { id: { in: sos.map(s => s.id) } } });
            }

            console.log('SUCCESS: All Opening Balance records purged.');
        });
    } catch (error) {
        console.error('ERROR during purge:', error);
    } finally {
        await prisma.$disconnect();
    }
}

run();
