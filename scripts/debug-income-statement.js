
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    const startDate = new Date('2026-02-01T00:00:00.000Z');
    const endDate = new Date('2026-02-28T23:59:59.999Z');

    console.log(`📊 analyzing Income Statement for Feb 2026 (${startDate.toISOString()} - ${endDate.toISOString()})`);

    // 1. Fetch Accounts with Journal Lines in Feb
    const accounts = await prisma.account.findMany({
        where: {
            type: { in: ['REVENUE', 'EXPENSE'] }
        },
        orderBy: { code: 'asc' },
        include: {
            journalLines: {
                where: {
                    journalEntry: {
                        entryDate: { gte: startDate, lte: endDate },
                        status: 'POSTED'
                    }
                },
                include: { journalEntry: true }
            }
        }
    });

    const accountData = accounts.map(a => {
        const isRevenue = a.type === 'REVENUE';
        const netBalance = a.journalLines.reduce((sum, l) => {
            const val = Number(l.credit) - Number(l.debit);
            return sum + (isRevenue ? val : -val);
        }, 0);
        return {
            id: a.id,
            code: a.code,
            name: a.name,
            type: a.type,
            netBalance,
            journalLines: a.journalLines
        };
    });

    // Breakdown
    const revenueAccounts = accountData.filter(a => a.type === 'REVENUE' || a.code.startsWith('4'));
    const cogsAccounts = accountData.filter(a => a.code.startsWith('5'));
    const opexAccounts = accountData.filter(a => a.code.startsWith('6') || a.code.startsWith('7') || a.code.startsWith('8'));

    console.log('\n--- REVENUE ---');
    revenueAccounts.filter(a => a.netBalance !== 0).forEach(a => {
        console.log(`${a.code} ${a.name}: ${a.netBalance.toLocaleString('id-ID')}`);
        // a.journalLines.forEach(l => console.log(`   - ${l.journalEntry.reference} (${l.journalEntry.description}): ${Number(l.credit) - Number(l.debit)}`));
    });

    console.log('\n--- COGS (Direct Costs) ---');
    cogsAccounts.filter(a => a.netBalance !== 0).forEach(a => {
        console.log(`${a.code} ${a.name}: ${a.netBalance.toLocaleString('id-ID')}`);
    });

    console.log('\n--- OpEx ---');
    opexAccounts.filter(a => a.netBalance !== 0).forEach(a => {
        console.log(`${a.code} ${a.name}: ${a.netBalance.toLocaleString('id-ID')}`);
    });

    // Inventory Change
    console.log('\n--- INVENTORY CHANGE ---');
    const inventoryAccounts = await prisma.account.findMany({
        where: { code: { startsWith: '113' } },
        select: { id: true, code: true, name: true }
    });

    const inventoryChange = await calculateInventoryChange(prisma, inventoryAccounts, startDate, endDate);
    console.log(`Inventory Change: ${inventoryChange.toLocaleString('id-ID')}`);

    // Calculation
    const totalRevenue = revenueAccounts.reduce((sum, a) => sum + a.netBalance, 0);
    const totalCOGS = cogsAccounts.reduce((sum, a) => sum + a.netBalance, 0);
    const totalOpEx = opexAccounts.reduce((sum, a) => sum + a.netBalance, 0);

    const adjustedCOGS = totalCOGS - inventoryChange;
    const grossProfit = totalRevenue - adjustedCOGS;
    const netIncome = grossProfit - totalOpEx;

    console.log('\n--- SUMMARY ---');
    console.log(`Total Revenue: ${totalRevenue.toLocaleString('id-ID')}`);
    console.log(`Direct COGS (Raw): ${totalCOGS.toLocaleString('id-ID')}`);
    console.log(`Inventory Change (Ending - Beginning): ${inventoryChange.toLocaleString('id-ID')}`);
    console.log(`Adjusted COGS (Direct - Change): ${adjustedCOGS.toLocaleString('id-ID')}`);
    console.log(`Gross Profit: ${grossProfit.toLocaleString('id-ID')}`);
    console.log(`Total OpEx: ${totalOpEx.toLocaleString('id-ID')}`);
    console.log(`Net Income: ${netIncome.toLocaleString('id-ID')}`);

    await prisma.$disconnect();
}

async function calculateInventoryChange(prisma, accounts, startDate, endDate) {
    // 1. Get Balances BEFORE Start Date (Beginning Balance)
    const beginningBalances = await prisma.journalLine.aggregate({
        where: {
            accountId: { in: accounts.map(a => a.id) },
            journalEntry: {
                entryDate: { lt: startDate },
                status: 'POSTED'
            }
        },
        _sum: { debit: true, credit: true }
    });

    const beginningVal = (Number(beginningBalances._sum.debit) || 0) - (Number(beginningBalances._sum.credit) || 0);
    console.log(`Beginning Inv (Pre-${startDate.toISOString().split('T')[0]}): ${beginningVal.toLocaleString('id-ID')}`);

    // 2. Get Balances UP TO End Date (Ending Balance)
    const endingBalances = await prisma.journalLine.aggregate({
        where: {
            accountId: { in: accounts.map(a => a.id) },
            journalEntry: {
                entryDate: { lte: endDate },
                status: 'POSTED'
            }
        },
        _sum: { debit: true, credit: true }
    });

    const endingVal = (Number(endingBalances._sum.debit) || 0) - (Number(endingBalances._sum.credit) || 0);
    console.log(`Ending Inv (Post-${endDate.toISOString().split('T')[0]}): ${endingVal.toLocaleString('id-ID')}`);

    return endingVal - beginningVal;
}

run().catch(e => console.error(e));
