
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. Find the Manual Opening Balance Entry to reverse
    // We assume it is ~121M based on the local investigation.
    // Ideally we should query it dynamically.

    const openingEntry = await prisma.journalEntry.findFirst({
        where: {
            reference: 'OPENING-GEN'
        },
        include: { lines: true }
    });

    if (!openingEntry) {
        console.log('No Opening Balance found to reverse');
        return;
    }

    // Determine the amount from the lines (debit to inventory)
    // We need to find the inventory account (11310) line
    const inventoryLine = openingEntry.lines.find(l => Number(l.debit) > 0); // Assuming it was a debit to inventory

    if (!inventoryLine) {
        console.log('Could not determine amount from opening entry');
        return;
    }

    const amount = Number(inventoryLine.debit);
    console.log(`Found Opening Balance Amount: ${amount}`);

    const date = new Date('2026-02-01T00:00:00.000Z');

    const rmAccount = await prisma.account.findUnique({ where: { code: '11310' } });
    const equityAccount = await prisma.account.findUnique({ where: { code: '30000' } });

    if (!rmAccount || !equityAccount) {
        console.error('Accounts not found');
        return;
    }

    // Check if reversal already exists
    const existing = await prisma.journalEntry.findFirst({
        where: { entryNumber: 'REV-JAN-01' }
    });

    if (existing) {
        console.log('Reversal entry already exists (REV-JAN-01). Skipping.');
        return;
    }

    console.log(`Creating Reversal for RM Account ${rmAccount.name} and Equity ${equityAccount.name}`);

    // Create Reversal Journal
    const journal = await prisma.journalEntry.create({
        data: {
            entryNumber: 'REV-JAN-01',
            entryDate: date,
            description: 'Reversal of Jan Opening Balance (Correction for Stock Opname)',
            reference: 'REVERSAL-JAN-OP',
            referenceType: 'MANUAL_ENTRY',
            status: 'POSTED',
            lines: {
                create: [
                    {
                        accountId: equityAccount.id,
                        debit: amount,
                        credit: 0,
                        description: 'Reversal: Opening Balance Equity'
                    },
                    {
                        accountId: rmAccount.id,
                        debit: 0,
                        credit: amount,
                        description: 'Reversal: Opening Balance Inventory'
                    }
                ]
            }
        }
    });

    console.log(`Reversal Journal Created: ${journal.id}`);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
