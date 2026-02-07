const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const invoiceIds = ['80be6cb7-fad6-42a2-a959-fb633246c1f6', '67e87518-2e2c-43ab-8201-160657e64717'];

    const entries = await prisma.journalEntry.findMany({
        where: { referenceId: { in: invoiceIds } },
        include: { lines: { include: { account: true } } }
    });

    console.log('Journal Entries found for these IDs:', entries.length);
    entries.forEach(entry => {
        console.log(`\nEntry: ${entry.entryNumber} (${entry.status}) - ${entry.description}`);
        entry.lines.forEach(line => {
            console.log(`  - ${line.account.name} (${line.account.type}) Debit: ${line.debit} Credit: ${line.credit}`);
        });
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
