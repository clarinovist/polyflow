
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- BALANCE SHEET DEBUG (As of Feb 14, 2026) ---');

    // 1. Get Equity Accounts (3xxxx)
    const equityAccounts = await prisma.account.findMany({
        where: { code: { startsWith: '3' } }
    });

    console.log('\nEQUITY ACCOUNTS:');
    for (const acc of equityAccounts) {
        const agg = await prisma.journalLine.aggregate({
            where: {
                accountId: acc.id,
                journalEntry: { status: 'POSTED' }
            },
            _sum: { debit: true, credit: true }
        });

        const debit = Number(agg._sum.debit || 0);
        const credit = Number(agg._sum.credit || 0);
        const balance = credit - debit; // Equity is normally Credit balance

        console.log(`${acc.code} - ${acc.name}: ${balance.toLocaleString('id-ID')} (Dr: ${debit}, Cr: ${credit})`);
    }

    // 2. Get Asset Accounts (1xxxx) - just specific ones
    console.log('\nASSET ACCOUNTS (Sample):');
    const assetAccounts = await prisma.account.findMany({
        where: { code: { in: ['11310', '11330'] } }
    });

    for (const acc of assetAccounts) {
        const agg = await prisma.journalLine.aggregate({
            where: {
                accountId: acc.id,
                journalEntry: { status: 'POSTED' }
            },
            _sum: { debit: true, credit: true }
        });

        const debit = Number(agg._sum.debit || 0);
        const credit = Number(agg._sum.credit || 0);
        const balance = debit - credit; // Asset is normally Debit balance

        console.log(`${acc.code} - ${acc.name}: ${balance.toLocaleString('id-ID')} (Dr: ${debit}, Cr: ${credit})`);
    }
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
