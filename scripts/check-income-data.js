const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const entries = await prisma.journalEntry.findMany({
        include: {
            lines: {
                include: { account: true }
            }
        }
    });

    console.log('Total Journal Entries:', entries.length);

    entries.forEach(entry => {
        const hasIncomeLine = entry.lines.some(l => ['REVENUE', 'EXPENSE'].includes(l.account.type));
        if (hasIncomeLine) {
            console.log(`\nEntry [${entry.status}]: ${entry.entryNumber} (${entry.entryDate.toISOString()}) - ${entry.description}`);
            entry.lines.forEach(line => {
                const type = line.debit > 0 ? 'DEBIT' : 'CREDIT';
                const amount = line.debit > 0 ? line.debit : line.credit;
                console.log(`  - Account: ${line.account.code} ${line.account.name} (${line.account.type}) ${type}: ${amount}`);
            });
        }
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
