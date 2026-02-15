
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const ref = 'Shipment for SO-2026-0001';
    console.log(`--- Investigating Shipment: "${ref}" ---`);

    // 1. Find the Journal Entry
    const journal = await prisma.journalEntry.findFirst({
        where: { reference: ref },
        include: {
            lines: {
                include: {
                    account: true
                }
            }
        }
    });

    if (!journal) {
        console.log('Journal not found.');
        return;
    }

    console.log(`Journal ID: ${journal.id}`);

    // 2. Check Stock Movements by Reference
    const stockMovements = await prisma.stockMovement.findMany({
        where: { reference: ref },
        include: { productVariant: { include: { product: true } } }
    });

    if (stockMovements.length > 0) {
        console.log(`\nLinked Stock Movements (${stockMovements.length}):`);
        stockMovements.forEach(sm => {
            const p = sm.productVariant.product;
            console.log(`- Product: ${p.name}`);
            console.log(`  Type: ${p.type}`);
            console.log(`  Inventory Account ID: ${p.inventoryAccountId}`);
            console.log(`  COGS Account ID: ${p.cogsAccountId}`);
        });
    } else {
        console.log('No StockMovement found with this journalEntryId.');
    }

    // 3. Show Lines
    console.log('\nJournal Lines:');
    journal.lines.forEach(l => {
        console.log(`${l.account.code} (${l.account.name}): ${l.debit > 0 ? 'Dr ' + l.debit : 'Cr ' + l.credit}`);
    });
}

main();
