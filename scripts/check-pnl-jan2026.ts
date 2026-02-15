
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("--- Checking for ANY Revenue/Expense Entries in Jan 2026 ---");
    const startDate = new Date('2026-01-01T00:00:00.000Z');
    const endDate = new Date('2026-01-31T23:59:59.999Z');

    const revExpJournals = await prisma.journalLine.findMany({
        where: {
            journalEntry: {
                entryDate: { gte: startDate, lte: endDate },
                status: 'POSTED'
            },
            account: {
                type: { in: ['REVENUE', 'EXPENSE'] }
            }
        },
        include: {
            account: true,
            journalEntry: true
        },
        take: 10
    });

    if (revExpJournals.length === 0) {
        console.log("No REVENUE or EXPENSE transactions found in Jan 2026.");
    } else {
        console.log(`Found ${revExpJournals.length} transactions. Sample:`);
        revExpJournals.forEach(l => {
            console.log(`${l.journalEntry.entryDate.toISOString()} | ${l.account.name} (${l.account.type}) | Dr: ${l.debit} | Cr: ${l.credit}`);
        });
    }
}

main();
