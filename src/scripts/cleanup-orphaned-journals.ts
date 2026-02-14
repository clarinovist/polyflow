import { PrismaClient, JournalStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupOrphans() {
    console.log("Starting cleanup of orphaned journal entries...");

    const jes = await prisma.journalEntry.findMany({
        where: {
            referenceType: { in: ['PURCHASE_INVOICE', 'SALES_INVOICE'] },
            status: JournalStatus.POSTED
        },
        select: { id: true, entryNumber: true, referenceId: true, referenceType: true }
    });

    let count = 0;
    for (const je of jes) {
        if (!je.referenceId) continue;

        let exists = false;
        if (je.referenceType === 'PURCHASE_INVOICE') {
            const pi = await prisma.purchaseInvoice.findUnique({ where: { id: je.referenceId } });
            exists = !!pi;
        } else if (je.referenceType === 'SALES_INVOICE') {
            const si = await prisma.invoice.findUnique({ where: { id: je.referenceId } });
            exists = !!si;
        }

        if (!exists) {
            console.log(`Voiding orphaned JE: ${je.entryNumber} (Ref ID: ${je.referenceId})`);

            // Delete lines to ensure they don't affect reports if reports use lines directly
            // even if status is checked (double safety)
            await prisma.journalLine.deleteMany({
                where: { journalEntryId: je.id }
            });

            await prisma.journalEntry.update({
                where: { id: je.id },
                data: { status: JournalStatus.VOIDED }
            });
            count++;
        }
    }

    console.log(`Cleanup complete. Voided ${count} orphaned journal entries.`);
}

cleanupOrphans()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
