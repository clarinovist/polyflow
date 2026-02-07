const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const types = ['SALES_INVOICE', 'PURCHASE_INVOICE', 'SALES_PAYMENT', 'PURCHASE_PAYMENT'];

    for (const type of types) {
        const count = await prisma.journalEntry.count({
            where: { referenceType: type }
        });
        console.log(`ReferenceType ${type}: ${count}`);

        if (count > 0) {
            const entry = await prisma.journalEntry.findFirst({
                where: { referenceType: type },
                include: { lines: { include: { account: true } } }
            });
            console.log(`Example for ${type}: ${entry.entryNumber} - ${entry.description}`);
            entry.lines.forEach(line => {
                console.log(`  - ${line.account.name} (${line.account.type}) ${line.debit > 0 ? 'Debit' : 'Credit'}: ${line.debit > 0 ? line.debit : line.credit}`);
            });
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
