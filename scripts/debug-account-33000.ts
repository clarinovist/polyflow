
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking for StockMovements of type ADJUSTMENT...');
    const movements = await prisma.stockMovement.findMany({
        where: { type: 'ADJUSTMENT' },
        take: 5,
        include: { productVariant: true }
    });

    if (movements.length === 0) {
        console.log('No ADJUSTMENT movements found');
    } else {
        movements.forEach(m => {
            console.log(`Date: ${m.createdAt.toISOString()} | Product: ${m.productVariant.name} | Qty: ${m.quantity} | Reason: ${m.reference}`);
        });
    }
}
const account = await prisma.account.findUnique({
    where: { code: accountCode },
    include: {
        journalLines: {
            include: { journalEntry: true },
            take: 10
        }
    }
});

if (!account) {
    console.log('Account not found in COA');
    return;
}

console.log(`Account Name: ${account.name}`);
console.log(`Account Type: ${account.type}`);

console.log('\n--- Recent Journal Lines ---');
if (account.journalLines.length === 0) {
    console.log('No journal lines found');
} else {
    account.journalLines.forEach(line => {
        console.log(`Date: ${line.journalEntry.entryDate.toISOString()} | Ref: ${line.journalEntry.reference} | Debit: ${line.debit} | Credit: ${line.credit}`);
    });
}

// Also sum all journal items
const sums = await prisma.journalLine.aggregate({
    where: { accountId: account.id },
    _sum: { debit: true, credit: true }
});
console.log(`\nJournal Totals -> Debit: ${sums._sum.debit || 0}, Credit: ${sums._sum.credit || 0}`);


// Check Journal Entries in January 2026
const jan2026Journals = await prisma.journalEntry.count({
    where: {
        entryDate: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-01-31T23:59:59.999Z')
        }
    }
});
console.log(`\nJournal Entries in January 2026: ${jan2026Journals}`);


// Check All Fiscal Periods
const allPeriods = await prisma.fiscalPeriod.findMany({
    orderBy: { startDate: 'asc' }
});
console.log('\n--- All Fiscal Periods ---');
allPeriods.forEach(p => {
    console.log(`Period: ${p.name} | Status: ${p.status} | Start: ${p.startDate.toISOString()} | End: ${p.endDate.toISOString()}`);
});

// Check Fiscal Periods
const periods = await prisma.fiscalPeriod.findMany({
    orderBy: { startDate: 'desc' },
    take: 5
});
console.log('\n--- Fiscal Periods ---');
periods.forEach(p => {
    console.log(`Period: ${p.name} | Status: ${p.status} | End: ${p.endDate.toISOString()}`);
});

// Check total journal lines in DB
const totalLines = await prisma.journalLine.count();
console.log(`\nTotal Journal Lines in DB: ${totalLines}`);
}

main();
