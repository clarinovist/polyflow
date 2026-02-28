const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const asOf = new Date('2026-01-31T23:59:59.999Z');

    const accounts = await prisma.account.findMany({
        where: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] } },
        orderBy: { code: 'asc' },
        include: {
            journalLines: {
                where: {
                    journalEntry: {
                        entryDate: { lte: asOf },
                        status: 'POSTED'
                    }
                }
            }
        }
    });

    console.log('=== BALANCE SHEET per 31 Jan 2026 ===\n');

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    console.log('--- ASET ---');
    accounts.filter(a => a.type === 'ASSET').forEach(a => {
        const bal = a.journalLines.reduce((s, l) => s + (Number(l.debit) - Number(l.credit)), 0);
        if (Math.abs(bal) > 0.01) {
            console.log(a.code + ' ' + a.name + ' = ' + bal.toLocaleString('id-ID'));
            totalAssets += bal;
        }
    });
    console.log('TOTAL ASET: ' + totalAssets.toLocaleString('id-ID'));

    console.log('\n--- HUTANG ---');
    accounts.filter(a => a.type === 'LIABILITY').forEach(a => {
        const bal = a.journalLines.reduce((s, l) => s + (Number(l.credit) - Number(l.debit)), 0);
        if (Math.abs(bal) > 0.01) {
            console.log(a.code + ' ' + a.name + ' = ' + bal.toLocaleString('id-ID'));
            totalLiabilities += bal;
        }
    });
    console.log('TOTAL HUTANG: ' + totalLiabilities.toLocaleString('id-ID'));

    console.log('\n--- MODAL ---');
    accounts.filter(a => a.type === 'EQUITY').forEach(a => {
        const bal = a.journalLines.reduce((s, l) => s + (Number(l.credit) - Number(l.debit)), 0);
        if (Math.abs(bal) > 0.01) {
            console.log(a.code + ' ' + a.name + ' = ' + bal.toLocaleString('id-ID'));
            totalEquity += bal;
        }
    });
    console.log('TOTAL MODAL: ' + totalEquity.toLocaleString('id-ID'));

    const unposted = totalAssets - (totalLiabilities + totalEquity);
    console.log('\n--- RINGKASAN ---');
    console.log('Total Aset:           ' + totalAssets.toLocaleString('id-ID'));
    console.log('Total Hutang:         ' + totalLiabilities.toLocaleString('id-ID'));
    console.log('Total Equity:         ' + totalEquity.toLocaleString('id-ID'));
    console.log('Unposted Earnings:    ' + unposted.toLocaleString('id-ID'));
    console.log('Hutang+Equity+Unpost: ' + (totalLiabilities + totalEquity + unposted).toLocaleString('id-ID'));

    console.log('\n--- NERACA TARGET ---');
    console.log('Total Aset Neraca:    926.636.985');
    console.log('Total Hutang Neraca:  88.613.200');
    console.log('Total Modal Neraca:   838.023.785');

    process.exit(0);
}

main();
