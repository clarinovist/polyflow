
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Searching for "Packaging" Accounts ---');
    const accounts = await prisma.account.findMany({
        where: {
            name: { contains: 'Packaging', mode: 'insensitive' }
        }
    });

    if (accounts.length === 0) {
        console.log('No accounts found with "Packaging" in the name.');
        return;
    }

    for (const acc of accounts) {
        console.log(`\nAccount: ${acc.code} - ${acc.name} (${acc.type})`);

        // Get Balance
        const sums = await prisma.journalLine.aggregate({
            where: { accountId: acc.id },
            _sum: { debit: true, credit: true }
        });

        const totalDebit = Number(sums._sum.debit || 0);
        const totalCredit = Number(sums._sum.credit || 0);
        const net = totalDebit - totalCredit;

        console.log(`Balance: ${net.toLocaleString()} (Debit Normal)`);

        // List last 20 transactions
        const lines = await prisma.journalLine.findMany({
            where: { accountId: acc.id },
            include: { journalEntry: true },
            orderBy: { journalEntry: { entryDate: 'desc' } },
            take: 20
        });

        console.log(`Last 20 Transactions:`);
        console.table(lines.map(l => ({
            date: l.journalEntry.entryDate.toISOString().split('T')[0],
            ref: l.journalEntry.reference,
            desc: l.description?.substring(0, 30),
            debit: l.debit,
            credit: l.credit
        })));
    }
}

main();
