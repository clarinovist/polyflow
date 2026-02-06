const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const entries = await prisma.journalEntry.findMany({
        where: { status: 'DRAFT' },
        include: {
            lines: {
                include: { account: true }
            }
        },
        take: 5
    });

    console.log('Draft Journal Entries Found:', entries.length);
    entries.forEach(entry => {
        console.log(`\nEntry: ${entry.entryNumber} (${entry.entryDate.toISOString()}) - ${entry.description}`);
        entry.lines.forEach(line => {
            const type = line.debit > 0 ? 'DEBIT' : 'CREDIT';
            const amount = line.debit > 0 ? line.debit : line.credit;
            console.log(`  - Account: ${line.account.code} ${line.account.name} (${line.account.type}) ${type}: ${amount}`);
        });
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
