
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    console.log('🔍 Starting Orphaned Invoice Restoration...');

    // 1. Process Accounts Receivable (SALES_INVOICE)
    const salesJournals = await prisma.journalEntry.findMany({
        where: { referenceType: 'SALES_INVOICE' },
        include: { lines: true }
    });

    console.log(`Checking ${salesJournals.length} Sales Journals...`);
    for (const je of salesJournals) {
        const existing = await prisma.invoice.findFirst({
            where: { invoiceNumber: je.reference }
        });

        if (!existing) {
            console.log(`- Missing Invoice for ${je.reference}. Attempting to restore...`);

            // Try to find a Sales Order ID in description or by ref
            let salesOrderId = null;
            const soMatch = je.description.match(/SO-\d+/);
            if (soMatch) {
                const so = await prisma.salesOrder.findUnique({ where: { orderNumber: soMatch[0] } });
                salesOrderId = so?.id;
            }

            // Fallback: If it's an opening balance, find the dummy SO or just create without SO link
            const amount = je.lines.find(l => l.debit > 0)?.debit || 0;

            await prisma.invoice.create({
                data: {
                    id: je.id, // Try to keep IDs sync'd if possible, or just new ID
                    invoiceNumber: je.reference,
                    invoiceDate: je.entryDate,
                    dueDate: je.entryDate,
                    totalAmount: Number(amount),
                    paidAmount: 0,
                    status: 'UNPAID',
                    salesOrderId: salesOrderId || (await findOrCreateDummySO(je.reference))
                }
            });
            console.log(`  ✅ Restored Sales Invoice: ${je.reference}`);
        }
    }

    // 2. Process Accounts Payable (PURCHASE_INVOICE)
    const purchaseJournals = await prisma.journalEntry.findMany({
        where: { referenceType: 'PURCHASE_INVOICE' },
        include: { lines: true }
    });

    console.log(`Checking ${purchaseJournals.length} Purchase Journals...`);
    for (const je of purchaseJournals) {
        const existing = await prisma.purchaseInvoice.findUnique({
            where: { invoiceNumber: je.reference }
        });

        if (!existing) {
            console.log(`- Missing Purchase Invoice for ${je.reference}. Attempting to restore...`);

            // Try to find a Purchase Order ID
            let purchaseOrderId = null;
            const poMatch = je.description.match(/PO-\d+/);
            if (poMatch) {
                const po = await prisma.purchaseOrder.findUnique({ where: { orderNumber: poMatch[0] } });
                purchaseOrderId = po?.id;
            }

            const amount = je.lines.find(l => l.credit > 0)?.credit || 0;

            await prisma.purchaseInvoice.create({
                data: {
                    id: je.id,
                    invoiceNumber: je.reference,
                    purchaseOrderId: purchaseOrderId || (await findOrCreateDummyPO(je.reference)),
                    invoiceDate: je.entryDate,
                    dueDate: je.entryDate,
                    totalAmount: Number(amount),
                    paidAmount: 0,
                    status: 'UNPAID'
                }
            });
            console.log(`  ✅ Restored Purchase Invoice: ${je.reference}`);
        }
    }

    console.log('✅ Restoration Completed.');
    await prisma.$disconnect();
}

async function findOrCreateDummySO(ref) {
    // Basic fallback for orphaned records that need a parent
    // In a real system, we'd want to find the true SO.
    return null; // Or return a system-wide "Legacy SO" ID
}

async function findOrCreateDummyPO(ref) {
    return null;
}

run().catch(err => {
    console.error('Restoration failed:', err);
    process.exit(1);
});
