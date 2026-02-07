const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const startDate = new Date('2026-01-01');
    const endDate = new Date('2026-12-31');

    const accounts = await prisma.account.findMany({
        where: {
            type: { in: ['REVENUE', 'EXPENSE'] }
        },
        include: {
            journalLines: {
                where: {
                    journalEntry: {
                        entryDate: { gte: startDate, lte: endDate },
                        status: 'POSTED'
                    }
                }
            }
        }
    });

    console.log('Income Statement Data Check:');
    let totalRevenue = 0;
    let totalExpense = 0;

    accounts.forEach(a => {
        const netBalance = a.journalLines.reduce((sum, l) => sum + (Number(l.credit) - Number(l.debit)), 0);
        if (a.type === 'REVENUE') {
            const amount = netBalance; // Credit - Debit for revenue
            if (amount !== 0) {
                console.log(`[REVENUE] ${a.code} ${a.name}: ${amount}`);
                totalRevenue += amount;
            }
        } else {
            const amount = -netBalance; // Debit - Credit for expense
            if (amount !== 0) {
                console.log(`[EXPENSE] ${a.code} ${a.name}: ${amount}`);
                totalExpense += amount;
            }
        }
    });

    console.log(`\nTotal Revenue: ${totalRevenue}`);
    console.log(`Total Expense: ${totalExpense}`);
    console.log(`Net Income: ${totalRevenue - totalExpense}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
