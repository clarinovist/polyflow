const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. GL Revenue (4xxxx)
    const revenueAgg = await prisma.journalLine.aggregate({
        where: {
            account: { code: { startsWith: '4' } },
            journalEntry: { status: 'POSTED' }
        },
        _sum: { credit: true, debit: true }
    });
    const glRevenue = (revenueAgg._sum.credit || 0) - (revenueAgg._sum.debit || 0);
    console.log(`GL Revenue (4xxxx): ${glRevenue.toLocaleString()}`);

    // 2. GL Receivables (112xx)
    const arAgg = await prisma.journalLine.aggregate({
        where: {
            account: { code: { startsWith: '112' } },
            journalEntry: { status: 'POSTED' }
        },
        _sum: { debit: true, credit: true }
    });
    const glReceivables = (arAgg._sum.debit || 0) - (arAgg._sum.credit || 0);
    console.log(`GL Receivables (112xx): ${glReceivables.toLocaleString()}`);

    // 3. Invoice Total (Operational Revenue)
    const invAgg = await prisma.invoice.aggregate({
        where: {
            status: { in: ['PAID', 'UNPAID', 'OVERDUE'] } // Exclude CANCELLED/DRAFT
        },
        _sum: { totalAmount: true }
    });
    console.log(`Invoice Revenue: ${invAgg._sum.totalAmount?.toLocaleString()}`);
    // 4. GL Cash (111xx)
    const cashAgg = await prisma.journalLine.aggregate({
        where: {
            account: { code: { startsWith: '111' } },
            journalEntry: { status: 'POSTED' }
        },
        _sum: { debit: true, credit: true }
    });
    const glCash = (cashAgg._sum.debit || 0) - (cashAgg._sum.credit || 0);
    console.log(`GL Cash Position (111xx): ${glCash.toLocaleString()}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
