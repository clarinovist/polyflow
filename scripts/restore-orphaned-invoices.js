
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
            const soMatch = (je.description || '').match(/SO-\d+/);
            if (soMatch) {
                const so = await prisma.salesOrder.findUnique({ where: { orderNumber: soMatch[0] } });
                salesOrderId = so?.id;
            }

            // Fallback: If it's an opening balance, find the dummy SO or just create without SO link
            const amount = je.lines.find(l => l.debit > 0)?.debit || 0;
            const resolvedSalesOrderId = salesOrderId || await findOrCreateDummySO(je.reference, je.entryDate, amount);

            await prisma.invoice.create({
                data: {
                    id: je.id, // Try to keep IDs sync'd if possible, or just new ID
                    invoiceNumber: je.reference,
                    invoiceDate: je.entryDate,
                    dueDate: je.entryDate,
                    totalAmount: Number(amount),
                    paidAmount: 0,
                    status: 'UNPAID',
                    salesOrderId: resolvedSalesOrderId
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
            const poMatch = (je.description || '').match(/PO-\d+/);
            if (poMatch) {
                const po = await prisma.purchaseOrder.findUnique({ where: { orderNumber: poMatch[0] } });
                purchaseOrderId = po?.id;
            }

            const amount = je.lines.find(l => l.credit > 0)?.credit || 0;
            const resolvedPurchaseOrderId = purchaseOrderId || await findOrCreateDummyPO(je.reference, je.entryDate, amount);

            await prisma.purchaseInvoice.create({
                data: {
                    id: je.id,
                    invoiceNumber: je.reference,
                    purchaseOrderId: resolvedPurchaseOrderId,
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

async function findOrCreateDummySO(ref, entryDate, amount) {
    const legacyOrderNumber = buildLegacyOrderNumber('SO-LEGACY-', ref);
    const existing = await prisma.salesOrder.findUnique({ where: { orderNumber: legacyOrderNumber } });
    if (existing) {
        return existing.id;
    }

    const created = await prisma.salesOrder.create({
        data: {
            orderNumber: legacyOrderNumber,
            orderDate: entryDate,
            status: 'DELIVERED',
            totalAmount: Number(amount),
            notes: `Legacy placeholder for restored invoice ${ref}`
        }
    });

    return created.id;
}

async function findOrCreateDummyPO(ref, entryDate, amount) {
    const legacyOrderNumber = buildLegacyOrderNumber('PO-LEGACY-', ref);
    const existing = await prisma.purchaseOrder.findUnique({ where: { orderNumber: legacyOrderNumber } });
    if (existing) {
        return existing.id;
    }

    const supplierId = await findOrCreateLegacySupplier();
    const created = await prisma.purchaseOrder.create({
        data: {
            orderNumber: legacyOrderNumber,
            supplierId,
            orderDate: entryDate,
            status: 'RECEIVED',
            totalAmount: Number(amount),
            notes: `Legacy placeholder for restored invoice ${ref}`
        }
    });

    return created.id;
}

async function findOrCreateLegacySupplier() {
    const legacyCode = 'LEGACY-SUPPLIER';
    const existing = await prisma.supplier.findUnique({ where: { code: legacyCode } });
    if (existing) {
        return existing.id;
    }

    const created = await prisma.supplier.create({
        data: {
            name: 'Legacy Supplier',
            code: legacyCode,
            notes: 'System placeholder for restored purchase invoices'
        }
    });

    return created.id;
}

function buildLegacyOrderNumber(prefix, ref) {
    const safeRef = String(ref || '').trim().replace(/[^A-Za-z0-9-]/g, '-');
    return `${prefix}${safeRef || 'UNKNOWN'}`;
}

run().catch(err => {
    console.error('Restoration failed:', err);
    process.exit(1);
});
