
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
    const endDate = new Date('2026-12-31T23:59:59.999Z');
    const startDate = new Date('2026-01-01T00:00:00.000Z');

    // 1. Get Income Statement Net Income
    const accountsIS = await prisma.account.findMany({
        where: { type: { in: ['REVENUE', 'EXPENSE'] } },
        include: {
            journalLines: {
                where: {
                    journalEntry: {
                        entryDate: { gte: startDate, lte: endDate },
                        status: 'POSTED',
                        NOT: { reference: { startsWith: 'CLOSING-' } }
                    }
                }
            }
        }
    });

    const netIncome = accountsIS.reduce((sum, a) => {
        const isRevenue = a.type === 'REVENUE';
        const balance = a.journalLines.reduce((s, l) => s + (Number(l.credit) - Number(l.debit)), 0);
        return sum + (isRevenue ? balance : -balance);
    }, 0);

    // 2. Get Balance Sheet Unposted + 33000
    const accountsBS = await prisma.account.findMany({
        where: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] } },
        include: {
            journalLines: {
                where: {
                    journalEntry: {
                        entryDate: { lte: endDate },
                        status: 'POSTED'
                    }
                }
            }
        }
    });

    const assets = accountsBS.filter(a => a.type === 'ASSET').reduce((sum, a) => sum + a.journalLines.reduce((s, l) => s + (Number(l.debit) - Number(l.credit)), 0), 0);
    const liabilities = accountsBS.filter(a => a.type === 'LIABILITY').reduce((sum, a) => sum + a.journalLines.reduce((s, l) => s + (Number(l.credit) - Number(l.debit)), 0), 0);
    const equityExcluding33000 = accountsBS.filter(a => a.type === 'EQUITY' && a.code !== '33000').reduce((sum, a) => sum + a.journalLines.reduce((s, l) => s + (Number(l.credit) - Number(l.debit)), 0), 0);
    const balance33000 = accountsBS.find(a => a.code === '33000')?.journalLines.reduce((s, l) => s + (Number(l.credit) - Number(l.debit)), 0) || 0;

    const totalEquityActual = equityExcluding33000 + balance33000;
    const unpostedEarnings = assets - (liabilities + totalEquityActual);
    const totalLabaBS = balance33000 + unpostedEarnings;

    console.log('--- VERIFIKASI DATA ---');
    console.log('Income Statement Net Income  :', netIncome.toLocaleString('id-ID'));
    console.log('Balance Sheet 33000 (Closed) :', balance33000.toLocaleString('id-ID'));
    console.log('Balance Sheet Unposted       :', unpostedEarnings.toLocaleString('id-ID'));
    console.log('Total Laba di Balance Sheet  :', totalLabaBS.toLocaleString('id-ID'));
    console.log('-----------------------');
    console.log('MATCH:', Math.abs(netIncome - totalLabaBS) < 0.01 ? 'YA ✅' : 'TIDAK ❌');

    process.exit(0);
}

verify();
