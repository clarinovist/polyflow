
import { PrismaClient, MovementType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const accountCode = '81100';
    console.log(`\nDetailed Breakdown for Account: ${accountCode} (Inventory Adjustment Gain)`);

    const account = await prisma.account.findUnique({
        where: { code: accountCode }
    });

    if (!account) {
        console.log(`Account ${accountCode} not found.`);
        return;
    }

    // Get all journal lines for this account
    const journalLines = await prisma.journalLine.findMany({
        where: { accountId: account.id },
        include: {
            journalEntry: true
        },
        orderBy: { journalEntry: { entryDate: 'desc' } }
    });

    // Get adjustment movements to match
    const adjustments = await prisma.stockMovement.findMany({
        where: { type: MovementType.ADJUSTMENT },
        include: {
            productVariant: true
        }
    });

    const movementMap = new Map();
    adjustments.forEach(m => {
        // Try matching by reference or ID
        movementMap.set(m.id, m);
        if (m.reference) movementMap.set(m.reference, m);
    });

    if (journalLines.length === 0) {
        console.log('No journal entries found.');
        return;
    }

    console.log(''.padEnd(135, '-'));
    console.log(`${'Date'.padEnd(12)} | ${'Product / Item'.padEnd(35)} | ${'Reference'.padEnd(25)} | ${'Amount (IDR)'.padStart(15)} | ${'Source'}`);
    console.log(''.padEnd(135, '-'));

    for (const line of journalLines) {
        const entry = line.journalEntry;
        const date = entry.entryDate.toISOString().split('T')[0];
        const amount = line.credit.toNumber();

        // Match logic
        let productName = 'Adjustment Entry';
        let source = 'Manual/Other';

        // 1. Try match by referenceId if it points to movement
        const move = movementMap.get(entry.referenceId) || movementMap.get(entry.reference);

        if (move) {
            productName = move.productVariant.name;
            source = move.reference || 'Stock Adjustment';
        } else if (line.description && line.description.includes(':')) {
            productName = line.description.split(':').pop()?.trim() || productName;
        }

        console.log(`${date.padEnd(12)} | ${productName.substring(0, 35).padEnd(35)} | ${entry.reference.substring(0, 25).padEnd(25)} | ${amount.toLocaleString('id-ID').padStart(15)} | ${source.substring(0, 30)}`);
    }

    process.exit(0);
}

main().catch(console.error);
