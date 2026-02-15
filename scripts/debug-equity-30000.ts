
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("--- Investigating Account 30000 (Opening Balance Equity) ---");

    // 1. Get total Balance
    const sums = await prisma.journalLine.aggregate({
        where: { account: { code: '30000' } },
        _sum: { debit: true, credit: true }
    });

    const totalDebit = Number(sums._sum.debit || 0);
    const totalCredit = Number(sums._sum.credit || 0);
    const netBalance = totalCredit - totalDebit; // Equity is Credit Normal

    console.log(`Total Debit: ${totalDebit.toLocaleString()}`);
    console.log(`Total Credit: ${totalCredit.toLocaleString()}`);
    console.log(`Net Balance (Credit - Debit): ${netBalance.toLocaleString()}`);

    // itemized breakdown
    console.log("\n--- Transaction Breakdown for 30000 ---");
    const lines = await prisma.journalLine.findMany({
        where: { account: { code: '30000' } },
        include: { journalEntry: true },
        orderBy: { journalEntry: { entryDate: 'asc' } }
    });

    lines.forEach(l => {
        const dr = Number(l.debit);
        const cr = Number(l.credit);
        console.log(`${l.journalEntry.entryDate.toISOString().split('T')[0]} | Ref: ${l.journalEntry.reference} | Dr: ${dr} | Cr: ${cr} | Desc: ${l.description}`);
    });
}

main();
