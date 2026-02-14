
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const account = await prisma.account.findUnique({
        where: { code: '11310' }
    });

    if (!account) return;

    const lines = await prisma.journalLine.findMany({
        where: { accountId: account.id, journalEntry: { status: 'POSTED' } },
        include: { journalEntry: true },
        orderBy: { journalEntry: { entryDate: 'asc' } }
    });

    let janBalance = 0;
    let febBalance = 0;

    console.log('--- JANUARY TRANSACTIONS ---');
    lines.filter(l => l.journalEntry.entryDate < new Date('2026-02-01')).forEach(l => {
        const amount = Number(l.debit) - Number(l.credit);
        janBalance += amount;
    });
    console.log(`>>> JANUARY ENDING BALANCE: ${janBalance.toLocaleString('id-ID')}`);

    console.log('\n--- FEBRUARY TRANSACTIONS ---');
    lines.filter(l => l.journalEntry.entryDate >= new Date('2026-02-01')).forEach(l => {
        const amount = Number(l.debit) - Number(l.credit);
        febBalance += amount;
        console.log(`[${l.journalEntry.entryDate.toISOString().split('T')[0]}] ${l.description || l.journalEntry.description}: ${amount.toLocaleString('id-ID')}`);
    });

    console.log(`>>> FEBRUARY MOVEMENT: ${febBalance.toLocaleString('id-ID')}`);
    console.log(`>>> TOTAL ENDING BALANCE: ${(janBalance + febBalance).toLocaleString('id-ID')}`);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
