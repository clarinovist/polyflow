const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Mimic the service logic
    const accounts = await prisma.account.findMany({
        orderBy: { code: 'asc' }
    });

    const where = {
        journalEntry: {
            status: 'POSTED'
        }
    };

    const balances = await prisma.journalLine.groupBy({
        by: ['accountId'],
        _sum: {
            debit: true,
            credit: true
        },
        where
    });

    console.log('--- Trial Balance Data Check ---');
    accounts.forEach(acc => {
        const agg = balances.find(b => b.accountId === acc.id);
        const debit = Number(agg?._sum.debit || 0);
        const credit = Number(agg?._sum.credit || 0);

        if (debit !== 0 || credit !== 0) {
            console.log(`[${acc.code}] ${acc.name}: Debit=${debit}, Credit=${credit}`);
        }
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
